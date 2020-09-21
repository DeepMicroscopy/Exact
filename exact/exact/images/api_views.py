import os, stat
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404
from rest_framework.status import HTTP_400_BAD_REQUEST
from django.http import HttpResponseBadRequest, HttpResponse
from django.template.response import TemplateResponse
from rest_framework.response import Response
from rest_framework import viewsets, permissions, renderers
from rest_framework.settings import api_settings
from rest_framework.decorators import action
from django.db.models import Q, Count
from django.db import transaction, connection
from exact.annotations.models import Annotation, AnnotationVersion
from . import models
from . import serializers
import django_filters
import base64

import numpy as np
import openslide
from openslide import OpenSlide, open_slide
import string
import random
import zipfile
import hashlib
from pathlib import Path
from czifile import czi2tif

from PIL import Image as PIL_Image
from util.slide_server import SlideCache, SlideFile, PILBytesIO
image_cache = SlideCache(cache_size=10)

class ImageFilterSet(django_filters.FilterSet):
    image_type = django_filters.ChoiceFilter(choices=models.Image.SOURCE_TYPES)
    annotation_type = django_filters.NumberFilter(field_name='annotations', method='filter_annotation_type')
    num_annotations = django_filters.RangeFilter(field_name='annotations', method='filter_num_annotations')
    verified = django_filters.BooleanFilter(field_name='annotations', method='filter_verified')

    class Meta:
        model = models.Image
        fields = {
            'id': ['exact'],
            'name': ['exact', 'contains'],
            'filename': ['exact', 'contains'],
            'time': ['exact', 'contains'],
            'mpp': ['exact', 'range'],
            'objectivePower': ['exact', 'range'],
            'width': ['exact', 'range'],
            'height': ['exact', 'range'],
            'image_type': [],
            'image_set': ['exact'],
        }

    def filter_verified(self, queryset, field_name, value):
        if value is not None:

            if value: # all verified
                queryset = queryset.filter(annotations__annotation_type__active=True, annotations__deleted=False,
                                 annotations__verifications__verified=True).distinct()
            else: # all un verified
                queryset = queryset.annotate(anno_count=Count('annotations', filter=Q(annotations__deleted=False, annotations__annotation_type__active=True)))

                queryset = queryset.filter(Q(annotations__annotation_type__active=True, annotations__deleted=False,
                                       annotations__verifications__verified=False) |
                                       Q(annotations__annotation_type__active=True, annotations__deleted=False,
                                       annotations__verifications=None) | Q(anno_count__lte=0)).distinct()
        return queryset

    def filter_num_annotations(self, queryset, field_name, value):
        """
        `num_annotations` check if the number of annotations is in range
        """
        if value:
            queryset = queryset.annotate(anno_count=Count('annotations', filter=Q(annotations__deleted=False, annotations__annotation_type__active=True)))
            if value.start is not None:
                queryset = queryset.filter(anno_count__gte=value.start)
            if value.stop is not None:
                queryset = queryset.filter(anno_count__lte=value.stop)

        return queryset

    def filter_annotation_type(self, queryset, field_name, value):
        """
        `use_annotation_type` check if a given annotation type is assignet to the image
        """
        if value:
            queryset = queryset.filter(
                annotations__deleted=False, annotations__annotation_type__active=True,
                annotations__annotation_type__id=value).distinct()

        return queryset



class ImageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = serializers.ImageSerializer
    filterset_class = ImageFilterSet

    def get_queryset(self):
        user = self.request.user
        return  models.Image.objects.filter(image_set__team__in=user.team_set.all()).select_related('image_set')

    @action(detail=True, methods=['GET'], name='Get Thumbnail for image PK')
    def thumbnail(self, request, pk=None):
        image = get_object_or_404(models.Image, id=pk)

        file_path = image.path()

        if Path(image.thumbnail_path()).exists():
            tile = PIL_Image.open(image.thumbnail_path())
        else:
            slide = image_cache.get(file_path)
            tile = slide._osr.get_thumbnail((128,128))
            tile.save(image.thumbnail_path())

        buf = PILBytesIO()
        tile.save(buf, 'png', quality=90)

        return HttpResponse(buf.getvalue(), content_type='image/png')

    @action(detail=True, methods=['GET'], name='Get slide information from image PK')
    def slide_information(self, request, pk=None):
        image = get_object_or_404(models.Image, id=pk)

        file_path = image.path()

        slide = image_cache.get(file_path)
        level_dimensions = slide._osr.level_dimensions
        level_downsamples = slide._osr.level_downsamples
        levels = slide._osr.level_count

        return Response({"id": id,
                            "level_dimensions": level_dimensions, 
                            "level_downsamples":level_downsamples,
                            "levels": levels})

    @action(detail=True, methods=['GET'], name='Get patch for image PK')
    def get_patch(self, request, pk=None):
        image = get_object_or_404(models.Image, id=pk)

        max_width = 2048
        max_height = 2048

        x = int(request.GET.get("x", 0))
        y = int(request.GET.get("y", 0))
        level = int(request.GET.get("level", 0))
        width = int(request.GET.get("width", image.width))
        if x + width > image.width:
            width = image.width - x

        height = int(request.GET.get("height", image.height))
        if y + height > image.height:
            height = image.height - y


        if width <= max_width and height <= max_height and width > 0 and height > 0:
            file_path = image.path()

            slide = image_cache.get(file_path)._osr

            patch = np.array(slide.read_region(location=(int(x), int(y)),
                                                level=level, size=(width, height)))[:, :, :3]
            
            patch = PIL_Image.fromarray(patch)

            buf = PILBytesIO()
            patch.save(buf, 'png', quality=90)

            return HttpResponse(buf.getvalue(), content_type='image/png')
        else:
            return Response({"Error":'Image patch not valid max size 2048x2048 pixel or size negativ'}, status=HTTP_400_BAD_REQUEST)

    def create(self, request):
        image_type = int(request.POST.get('image_type', 0))
        image_set_id = int(request.POST.get('image_set', 0))

        imageset = get_object_or_404(models.ImageSet, id=image_set_id)
        if request.FILES is None:
            return HttpResponseBadRequest('Must have files attached!')

        images = []
        errors = []
        for f in list(request.FILES.values()):
            error = {
                'duplicates': 0,
                'damaged': False,
                'directories': False,
                'exists': False,
                'unsupported': False,
                'zip': False,
                'convert': False
            }

            magic_number = f.read(4)
            f.seek(0)  # reset file cursor to the beginning of the file

            file_list = {}
            if magic_number == b'PK\x03\x04':
                zipname = ''.join(random.choice(string.ascii_uppercase +
                                                string.ascii_lowercase +
                                                string.digits)
                                  for _ in range(6)) + '.zip'
                with open(os.path.join(imageset.root_path(), zipname), 'wb') as out:
                    for chunk in f.chunks():
                        out.write(chunk)
                # unpack zip-file
                zip_ref = zipfile.ZipFile(os.path.join(imageset.root_path(), zipname), 'r')
                zip_ref.extractall(os.path.join(imageset.root_path()))
                zip_ref.close()
                # delete zip-file
                os.remove(os.path.join(imageset.root_path(), zipname))
                filenames =  [f.filename for f in zip_ref.filelist]
                filenames.sort()
                duplicat_count = 0
                for filename in filenames:
                    file_path = os.path.join(imageset.root_path(), filename)
                    if models.Image.objects.filter(Q(filename=filename)|Q(name=f.name),
                                                                image_set=imageset).count() == 0:
                        try:
                            # creates a checksum for image
                            fchecksum = hashlib.sha512()
                            with open(file_path, 'rb') as fil:
                                while True:
                                    buf = fil.read(10000)
                                    if not buf:
                                        break
                                    fchecksum.update(buf)
                            fchecksum = fchecksum.digest()

                            # check if vms is in any images then just save the vms files
                            # else for each jpg a new image will be created in the databse
                            if any(".vms" in f for f in filenames) and ".vms" in filename:
                                file_list[file_path] = fchecksum
                            elif(any(".vms" in f for f in filenames) == False):
                                file_list[file_path] = fchecksum
                        except IsADirectoryError:
                            error['directories'] = True
                        except:
                            error['unsupported'] = True
                    else:
                        duplicat_count += 1

                if duplicat_count > 0:
                    error['duplicates'] = duplicat_count
            else:
                # creates a checksum for image
                fchecksum = hashlib.sha512()
                for chunk in f.chunks():
                    fchecksum.update(chunk)
                fchecksum = fchecksum.digest()

                filename = os.path.join(imageset.root_path(), f.name)
                # tests for duplicats in  imageset
                image = models.Image.objects.filter(Q(filename=filename)|Q(name=f.name), checksum=fchecksum,
                                        image_set=imageset).first()
                if image is None:
                    with open(filename, 'wb') as out:
                        for chunk in f.chunks():
                            out.write(chunk)

                    file_list[filename] = fchecksum
                else:
                    error['exists'] = True
                    error['exists_id'] = image.id
            for path in file_list:
                try:
                    fchecksum = file_list[path]

                    path = Path(path)
                    name = path.name

                    image = models.Image(
                        name=name,
                        image_set=imageset,
                        checksum=fchecksum)

                    # check if the file can be opened by OpenSlide if not convert it
                    try:
                        osr = OpenSlide(str(path))
                        image.filename = path.name
                    except:
                        import pyvips
                        old_path = path

                        #check if it is a CellVizio MKT file by suffix and save each frame to a seperate file
                        if Path(path).suffix.lower().endswith(".mkt"):
                            reader = ReadableCellVizioMKTDataset(str(path))
                            image.frames = reader.numberOfFrames
                            image.channels = 1
                            image.mpp = (float(reader.mpp_x) + float(reader.mpp_y)) / 2
                            # create sub dir to save frames
                            folder_path = Path(imageset.root_path()) / path.stem
                            os.makedirs(str(folder_path), exist_ok =True)
                            os.chmod(str(folder_path), 0o777)
                            for frame_id in range(image.frames):
                                height, width = reader.dimensions 
                                np_image = np.array(reader.read_region(location=(0,0), size=(reader.dimensions), level=0, zLevel=frame_id))[:,:,0]
                                linear = np_image.reshape(height * width * image.channels)
                                vi = pyvips.Image.new_from_memory(np.ascontiguousarray(linear.data), height, width, image.channels, 'uchar')

                                target_file = folder_path / "{}_{}_{}".format(1, frame_id + 1, path.name) #z-axis frame image
                                vi.tiffsave(str(target_file), tile=True, compression='lzw', bigtiff=True, pyramid=True,  tile_width=256, tile_height=256)

                                # save first frame as default file for thumbnail etc.
                                if frame_id == 0:
                                    image.filename = target_file.name
                        # check if its a zeiss file
                        elif  Path(path).suffix.lower().endswith(".czi"):
                            path_temp = Path(path).with_suffix('.tif')
                            path = Path(path).with_suffix('.tiff')

                            czi2tif(str(old_path), tiffile=str(path_temp), bigtiff=True)

                            vi = pyvips.Image.new_from_file(str(path_temp))
                            vi.tiffsave(str(path), tile=True, compression='jpeg', bigtiff=True, pyramid=True, tile_width=256, tile_height=256, Q=90)

                            os.remove(str(path_temp))
                            image.filename = path.name
                        # Videos
                        elif Path(path).suffix.lower().endswith(".avi"):
                            dtype_to_format = {
                                'uint8': 'uchar',
                                'int8': 'char',
                                'uint16': 'ushort',
                                'int16': 'short',
                                'uint32': 'uint',
                                'int32': 'int',
                                'float32': 'float',
                                'float64': 'double',
                                'complex64': 'complex',
                                'complex128': 'dpcomplex',
                            }

                            folder_path = Path(imageset.root_path()) / path.stem
                            os.makedirs(str(folder_path), exist_ok =True)
                            os.chmod(str(folder_path), 0o777)

                            cap = cv2.VideoCapture(str(Path(path)))
                            frame_id = 0
                            while cap.isOpened():
                                ret, frame = cap.read()
                                if not ret:
                                    # if video has just one frame copy file to top layer
                                    if frame_id == 1:
                                        copy_path = Path(path).with_suffix('.tiff')
                                        shutil.copyfile(str(target_file), str(copy_path))
                                        image.filename = copy_path.name
                                    break

                                height, width, bands = frame.shape
                                linear = frame.reshape(width * height * bands)

                                vi = pyvips.Image.new_from_memory(np.ascontiguousarray(linear.data), width, height, bands,
                                                                    dtype_to_format[str(frame.dtype)])
                                if dtype_to_format[str(frame.dtype)] not in ["uchar"]:
                                    vi = vi.scaleimage()

                                height, width, channels = vi.height, vi.width, vi.bands
                                image.channels = channels

                                target_file = folder_path / "{}_{}_{}".format(1, frame_id + 1, path.name) #z-axis frame image
                                vi.tiffsave(str(target_file), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)

                                # save first frame as default file for thumbnail etc.
                                if frame_id == 0:
                                    image.filename = target_file.name
                                frame_id += 1
                                
                            image.frames = frame_id
                        # check if file is philips iSyntax
                        elif Path(path).suffix.lower().endswith(".isyntax"):
                            from util.ISyntaxContainer import ISyntaxContainer
                            old_path = path
                            path = Path(path).with_suffix('.tiff')

                            converter = ISyntaxContainer(str(old_path))
                            converter.convert(str(path), 0)
                            image.objectivePower = 40
                            image.filename = path.name
                        # check if possible multi frame tiff
                        elif path.suffix.lower().endswith(".tiff") or path.suffix.lower().endswith(".tif"):
                            shape = tifffile.imread(str(path)).shape
                            image_saved = False
                            if len(shape) >= 3: # possible multi channel or frames
                                #Possible formats (10, 300, 300, 3) (10, 300, 300)
                                if (len(shape) == 4 and shape[-1] in [1, 3, 4]) or len(shape) == 3 and shape[-1] not in [1, 3, 4]: 
                                    image_saved = True
                                    frames = shape[0]
                                    image.frames = frames

                                    folder_path = Path(imageset.root_path()) / path.stem
                                    os.makedirs(str(folder_path), exist_ok =True)
                                    os.chmod(str(folder_path), 0o777)

                                    for frame_id in range(shape[0]):
                                        vi = pyvips.Image.new_from_file(str(path), page=frame_id)
                                        vi = vi.scaleimage()
                                        height, width, channels = vi.height, vi.width, vi.bands
                                        image.channels = channels

                                        target_file = folder_path / "{}_{}_{}".format(1, frame_id + 1, path.name) #z-axis frame image
                                        vi.tiffsave(str(target_file), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)

                                        # save first frame as default file for thumbnail etc.
                                        if frame_id == 0:
                                            image.filename = target_file.name
                            if image_saved == False:
                                path = Path(path).with_suffix('.tiff')

                                vi = pyvips.Image.new_from_file(str(old_path))
                                vi.tiffsave(str(path), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)
                                image.filename = path.name
                        else:                            
                            path = Path(path).with_suffix('.tiff')

                            vi = pyvips.Image.new_from_file(str(old_path))
                            vi.tiffsave(str(path), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)
                            image.filename = path.name

                    osr = OpenSlide(image.path())
                    image.width, image.height = osr.level_dimensions[0]
                    try:
                        mpp_x = osr.properties[openslide.PROPERTY_NAME_MPP_X]
                        mpp_y = osr.properties[openslide.PROPERTY_NAME_MPP_Y]
                        image.mpp = (float(mpp_x) + float(mpp_y)) / 2
                    except (KeyError, ValueError):
                        image.mpp = 0
                    try:
                        image.objectivePower = osr.properties[openslide.PROPERTY_NAME_OBJECTIVE_POWER]
                    except (KeyError, ValueError):
                        image.objectivePower = 1
                    image.save()

                    images.append(image)
                except:
                    error['unsupported'] = True
                    os.remove(str(path))

                errors.append(error)

        queryset = self.get_queryset().filter(id__in=[image.id for image in images])
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def destroy(self, request, pk=None):
        image = get_object_or_404(models.Image, id=pk)
        # remove image from file system
        if Path(image.path()).exists(): os.remove(image.path())
        if Path(image.original_path()).exists(): os.remove(image.original_path())
        # remove image from db
        return super().destroy(request, pk)
        
    def list(self, request, *args, **kwargs):
        if "api" in request.META['PATH_INFO']:
            return super(ImageViewSet, self).list(request, *args, **kwargs)
        else:
            images = self.filter_queryset(self.get_queryset()).order_by('image_set', 'id')

            current_query = request.META['QUERY_STRING']
            if "page" not in request.query_params:
                current_query += "&page=1"
                page_id = 1
            else:
                page_id = int(request.query_params.get('page', 1))            
            limit = int(request.query_params.get('limit', api_settings.PAGE_SIZE))


            paginator = Paginator(images, limit)
            page = paginator.get_page(page_id)

            previous_query = first_query = current_query.replace("&page="+str(page_id), "&page=1")
            if page.has_previous():
                previous_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.previous_page_number()))
            
            next_query = last_query = current_query.replace("&page="+str(page_id), "&page={}".format(paginator.num_pages))
            if page.has_next():
                next_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.next_page_number()))


            return TemplateResponse(request, 'base/explore.html', {
                'mode': 'images',
                'images': page,  # to separate what kind of stuff is displayed in the view
                'paginator': page,  # for page stuff
                'first_query': first_query,
                'previous_query': previous_query,
                'next_query': next_query,
                'last_query': last_query,
                #'filter': self.filterset_class
            })



class ImageSetFilterSet(django_filters.FilterSet):
    collaboration_type = django_filters.ChoiceFilter(choices=models.ImageSet.COLLABORATION_TYPES)
    priority = django_filters.ChoiceFilter(choices=models.ImageSet.PRIORITIES)
    zip_state = django_filters.ChoiceFilter(choices=models.ImageSet.ZIP_STATES)
    #images = django_filters.AllValuesFilter(field_name='images', label='Images',method="get_query")
    images = django_filters.ModelChoiceFilter(queryset=models.Image.objects.all() ,method="get_query")

    class Meta:
        model = models.ImageSet
        fields = {
            'id': ['exact'],
            'path': ['exact', 'contains'],
            'name': ['exact', 'contains'],
            'location': ['exact', 'contains'],
            'description': ['exact', 'contains'],
            'time': ['exact', 'range'],
            'team': ['exact'],
            'creator': ['exact'],
            'public': ['exact'],
            'main_annotation_type': ['exact'],
            'images': [],
            'set_tags': ['exact'],
            'set_versions': ['exact'],
            'product': ['exact'],

            'collaboration_type': [],
            'priority': [],
            'zip_state': [],
        }

    def get_query(self, queryset, field_name, value):
        if value:
            if field_name == "images":
                return queryset.filter(images__id=value.id)
        return queryset

class ImageSetViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.ImageSet.objects.all().select_related('team', 'creator', 'main_annotation_type')
    serializer_class = serializers.ImageSetSerializer
    filterset_class = ImageSetFilterSet
    #renderer_classes = (renderers.JSONRenderer, renderers.TemplateHTMLRenderer)

    def get_queryset(self):
        user = self.request.user
        return  models.ImageSet.objects.filter(team__in=user.team_set.all()).select_related('team', 'creator', 'main_annotation_type').order_by('id')


    def create(self, request):
        user = self.request.user
        if "creator" not in request.data:
            request.data["creator"] = user.id
        response = super().create(request)
        # add path and creator
        with transaction.atomic():
            image_set = models.ImageSet.objects.filter(id=response.data['id']).first()
            image_set.path = '{}_{}_{}'.format(connection.settings_dict['NAME'], image_set.team.id,
                                           image_set.id)
            image_set.save()
            folder_path = image_set.root_path()
            os.makedirs(folder_path)
            os.chmod(folder_path, 0o777)
        return response

    def list(self, request, *args, **kwargs):
        if "api" in request.META['PATH_INFO']:
            return super(ImageSetViewSet, self).list(request, *args, **kwargs)
        else:
            imagesets = self.filter_queryset(self.get_queryset()).order_by('team', 'id')

            current_query = request.META['QUERY_STRING']
            if "page" not in request.query_params:
                current_query += "&page=1"
                page_id = 1
            else:
                page_id = int(request.query_params.get('page', 1))            
            limit = int(request.query_params.get('limit', api_settings.PAGE_SIZE))


            paginator = Paginator(imagesets, limit)
            page = paginator.get_page(page_id)

            previous_query = first_query = current_query.replace("&page="+str(page_id), "&page=1")
            if page.has_previous():
                previous_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.previous_page_number()))
            
            next_query = last_query = current_query.replace("&page="+str(page_id), "&page={}".format(paginator.num_pages))
            if page.has_next():
                next_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.next_page_number()))


            return TemplateResponse(request, 'base/explore.html', {
                'mode': 'imageset',
                'imagesets': page,  # to separate what kind of stuff is displayed in the view
                'paginator': page,  # for page stuff
                'first_query': first_query,
                'previous_query': previous_query,
                'next_query': next_query,
                'last_query': last_query,
                #'filter': self.filterset_class
            })

class SetTagViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    
    serializer_class = serializers.SetTagSerializer
    filterset_fields = {
       'id': ['exact'],
       'name': ['exact', 'contains'],
       'imagesets': ['exact'],
    }

    def get_queryset(self):
        user = self.request.user
        return  models.SetTag.objects.filter(imagesets__team__in=user.team_set.all()).distinct().order_by('id')

class SetVersionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    
    serializer_class = serializers.SetVersionSerializer
    filterset_fields = {
       'id': ['exact'],
       'name': ['exact', 'contains'],
       'imagesets': ['exact'],
    }

    def get_queryset(self):
        user = self.request.user
        return  models.SetVersion.objects.filter(imagesets__team__in=user.team_set.all()).order_by('id')

    def create(self, request):
        response = super().create(request)
        # add path and creator
        with transaction.atomic():

            version = models.SetVersion.objects.filter(id=response.data['id']).first()

            if version is not None:
                with transaction.atomic():
                    anno_versions = []
                    for anno in Annotation.objects.filter(image__image_set__in=version.imagesets.all()):

                        anno_version = AnnotationVersion()
                        anno_version.version = version
                        anno_version.annotation = anno
                        anno_version.image = anno.image
                        anno_version.annotation_type = anno.annotation_type

                        anno_version.deleted = anno.deleted
                        anno_version.vector = anno.vector

                        anno_versions.append(anno_version)
                    
                    AnnotationVersion.objects.bulk_create(anno_versions, 512)

        return response


    def list(self, request, *args, **kwargs):
        if "api" in request.META['PATH_INFO']:
            return super(SetVersionViewSet, self).list(request, *args, **kwargs)
        else:
            versions = self.filter_queryset(self.get_queryset()).order_by('imagesets', 'id')

            current_query = request.META['QUERY_STRING']
            if "page" not in request.query_params:
                current_query += "&page=1"
                page_id = 1
            else:
                page_id = int(request.query_params.get('page', 1))
            
            limit = int(request.query_params.get('limit', api_settings.PAGE_SIZE))
           
            paginator = Paginator(versions, limit)
            page = paginator.get_page(page_id)

            previous_query = first_query = current_query.replace("&page="+str(page_id), "&page=1")
            if page.has_previous():
                previous_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.previous_page_number()))
            
            next_query = last_query = current_query.replace("&page="+str(page_id), "&page={}".format(paginator.num_pages))
            if page.has_next():
                next_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.next_page_number()))

            return TemplateResponse(request, 'base/explore.html', {
                'mode': 'versions',
                'versions': page,  # to separate what kind of stuff is displayed in the view
                'paginator': page,  # for page stuff
                'first_query': first_query,
                'previous_query': previous_query,
                'next_query': next_query,
                'last_query': last_query,
                #'filter': self.filterset_class
            })


class ScreeningModeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.ScreeningMode.objects.all().select_related('image', 'user')
    serializer_class = serializers.ScreeningModeSerializer
    filterset_fields = {
       'id': ['exact'],
       'image': ['exact'],
       'user': ['exact'],
    }

    def get_queryset(self):
        user = self.request.user
        return  models.ScreeningMode.objects.filter(image__image_set__team__in=user.team_set.all()).select_related('image', 'user').order_by('id')

    def partial_update(self, request, *args, **kwargs):
        user = self.request.user
        if "current_index" in request.data:
            screening = self.get_queryset().filter(id=kwargs['pk']).first()
            if screening is not None:
                screening.screening_tiles[str(request.data['current_index'])]['Screened'] = True
                screening.save()

        response = super().partial_update(request, *args, **kwargs)
        return response