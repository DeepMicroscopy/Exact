import logging
import os, stat
from timeit import default_timer as timer
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404
from rest_framework.status import HTTP_400_BAD_REQUEST, HTTP_202_ACCEPTED, HTTP_201_CREATED
from django.http import HttpResponseBadRequest, HttpResponse, HttpResponseNotFound
from django.template.response import TemplateResponse
from rest_framework.response import Response
from rest_framework import viewsets, permissions, renderers
from rest_framework.settings import api_settings
from rest_framework.decorators import action
from django.db.models import Q, Count
from django.db import transaction, connection
from django.http import JsonResponse

from django.core.cache import caches
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page

from exact.annotations.models import Annotation, AnnotationVersion
from . import models
from . import serializers
import django_filters
import base64

import sys
import json
import cv2
import numpy as np
import openslide
from openslide import OpenSlide, open_slide
import string
import random
import zipfile
import hashlib
from pathlib import Path
from czifile import czi2tif
from util.cellvizio import ReadableCellVizioMKTDataset # just until data access is pip installable

from PIL import Image as PIL_Image
from util.slide_server import SlideCache, SlideFile, PILBytesIO
image_cache = SlideCache(cache_size=10)

logger = logging.getLogger('django')
cache = caches['default']
try:
    tiles_cache = caches['tiles_cache']
except:
    tiles_cache = cache

class ImageFilterSet(django_filters.FilterSet):
    image_type = django_filters.ChoiceFilter(choices=models.Image.SOURCE_TYPES)
    annotation_type = django_filters.NumberFilter(field_name='annotations', method='filter_annotation_type')
    num_annotations = django_filters.RangeFilter(field_name='annotations', method='filter_num_annotations')
    verified = django_filters.BooleanFilter(field_name='annotations', method='filter_verified')

    class Meta:
        model = models.Image
        fields = {
            'id': ['exact', 'in'],
            'name': ['exact', 'contains', 'in'],
            'filename': ['exact', 'contains', 'in'],
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

    @action(detail=True, methods=['PATCH'], name='Updates the image cach')
    def update_image_cache(self, request, pk=None):

        image = get_object_or_404(models.Image, id=pk)

        mem_size = int(request.data.get("mem_size_mb", 5))
        z_dimension = int(request.data.get("z_dimension", 1))
        frame = int(request.data.get("frame", 1))

        slide = image_cache.get(image.path())

        keys = {}
        results = {}
        num_tiles = 0
        sum_cache = 0
        for level, tiles in enumerate(slide.level_tiles):
            #level += 1
            num_x_tiles, num_y_tiles = tiles

            start = timer()
            for col in range(num_x_tiles):
                for row in range(num_y_tiles):

                    cache_key = f"{pk}/{z_dimension}/{frame}/{level}/{col}/{row}"
                    if tiles_cache.has_key(cache_key) == False:

                        tile = slide.get_tile(level, (col, row))

                        buf = PILBytesIO()
                        tile.save(buf, "jpeg", quality=90)
                        image_buf = buf.getvalue()

                        if hasattr(cache, "delete_pattern"):
                            tiles_cache.set(cache_key, image_buf, 7*24*24)

                        buffer_size = sys.getsizeof(image_buf) / (1024 ** 2) # bytes to MBytes
                        keys[cache_key] = buffer_size

                        sum_cache += buffer_size
                        num_tiles += 1

                    if sum_cache > mem_size:
                        break
                if sum_cache > mem_size:
                    break

            results[level] = {
                "Level": level,
                "Size_MB": sum(keys.values()),
                "Tiles": tiles,
                "Total": num_tiles,
                "Sec.": timer() - start
            }

            if sum_cache > mem_size:
                 break
        return JsonResponse(results)

    @action(detail=True, methods=['GET'], name='Get Thumbnail for image PK')
    def thumbnail(self, request, pk=None):

        start = timer()
        buffer = cache.get(f"{pk}_thumbnail")
        if buffer is not None:
            logger.info(f"{timer() - start:.4f};{request.path};C")
            return HttpResponse(buffer, content_type='image/png')

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
        buffer = buf.getvalue()

        if hasattr(cache, "delete_pattern"):
            cache.set(f"{pk}_thumbnail", buffer, None)

        logger.info(f"{timer() - start:.4f};{request.path};")
        return HttpResponse(buffer, content_type='image/png')

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



    @action(detail=True, methods=['POST'], name='Create the registration between two slides')
    def register_images(self, request, pk=None):

        source_image = get_object_or_404(models.Image, id=pk)
        target_image = get_object_or_404(models.Image, id=int(request.data.get("target_image", 0)))

        image_registration = models.ImageRegistration.objects.filter(source_image=source_image, target_image=target_image).first()        

        # register the two images
        return_status = HTTP_202_ACCEPTED    
        if image_registration is None:

            image_registration = models.ImageRegistration(source_image=source_image, target_image=target_image)        
            return_status = HTTP_201_CREATED
        
        image_registration.perform_registration(**request.data)

        if request.data.get("create_inverse_registration", False):
            image_registration.create_inverse_registration()

        return Response(serializers.ImageRegistrationSerializer(image_registration).data, return_status)

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

                    image.save_file(path)
                    images.append(image)

                except Exception as e:
                    errors.append(e.message)

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
        # remove from tile cache
        if hasattr(cache, "delete_pattern"):
            cache_key = f"*{pk}/*/*/*/*/*"
            tiles_cache.delete_pattern(cache_key)        
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
            'id': ['exact', 'in'],
            'path': ['exact', 'contains'],
            'name': ['exact', 'contains', 'in'],
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
            image_set.create_folder()
        return response

    def retrieve(self, request, *args, **kwargs):

        cache_key = request.META["PATH_INFO"] + request.META["QUERY_STRING"]

        data = cache.get(cache_key)
        instance = self.get_object() # check if user has access
        if data is None:
            serializer = self.get_serializer(instance)
            data = serializer.data

            if hasattr(cache, "delete_pattern"):
                cache.set(cache_key, data, 24*60*60)

        return Response(data)

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

    @action(detail=True, methods=['POST'], name='Upload version meta file')
    def add(self, request, pk=None, *args, **kwargs):
        set_version = get_object_or_404(models.SetVersion, id=pk)

        if "file" in request.FILES:
            set_version.file = request.FILES["file"]
            set_version.save()

        if "api" in request.META['PATH_INFO']:
            return super(SetVersionViewSet, self).retrieve(request, pk)
        else:
            return self.list(request, *args, **kwargs)


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


class ImageRegistrationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = serializers.ImageRegistrationSerializer
    filterset_fields = {
       'id': ['exact', 'in'],
       'target_image': ['exact', 'in'],
       'source_image': ['exact', 'in'],
       'registration_error': ['range'],
       'runtime': ['range'],
    }

    def get_queryset(self):
        user = self.request.user
        return  models.ImageRegistration.objects.filter(source_image__image_set__team__in=user.team_set.all()).select_related('source_image', 'target_image').order_by('id')


    @action(detail=True, methods=['GET'], name='Convert coordinates form the source to the target domain')
    def convert_coodinates(self, request, pk=None):
        image_registration = get_object_or_404(models.ImageRegistration, id=pk)   

        vector = request.query_params.get("vector", None) 
        if vector is None:
            return HttpResponseBadRequest('vector parameter not set')

        vector = json.loads(vector.replace("\'", "\""))

        result_vector = image_registration.convert_coodinates(vector)

        return Response(result_vector, HTTP_202_ACCEPTED)


    @action(detail=True, methods=['GET'], name='Convert coordinates form the source to the target domain')
    def create_inverse_registration(self, request, pk=None):
        image_registration = get_object_or_404(models.ImageRegistration, id=pk)   

        new_registration = image_registration.create_inverse_registration()

        return Response(serializers.ImageRegistrationSerializer(new_registration).data, HTTP_201_CREATED)