import logging
import os, stat
import re
from django.conf import settings
from timeit import default_timer as timer
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404
from exact.users.scope import scope_queryset, check_team, token_team_ids
from rest_framework.status import HTTP_400_BAD_REQUEST, HTTP_202_ACCEPTED, HTTP_201_CREATED
from django.http import HttpResponseBadRequest, HttpResponse, HttpResponseNotFound
from django.template.response import TemplateResponse
from rest_framework.response import Response
from rest_framework import viewsets, permissions, renderers
from rest_framework.settings import api_settings
from rest_framework.decorators import action
from django.db.models import Q, Count, Prefetch
from exact.base.flex_fields import serializes_field, expands_field, omits_nested
from exact.base.http_cache import cache_in_browser
from django.db import transaction, connection
from django.http import JsonResponse, Http404

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
from util.slide_server import SlideCache, SlideFile, PILBytesIO, image_cache

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
            'defaultFrame' : ['exact','range'],
            'FrameDescriptions' : [],
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


class AuxiliaryFileViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = serializers.AuxiliaryFileSerializer


class ImageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = serializers.ImageSerializer
    filterset_class = ImageFilterSet

    def get_queryset(self):
        user = self.request.user
        queryset = scope_queryset(self.request, models.Image.objects.filter(image_set__team__in=user.team_set.all()), 'image_set__team').select_related('image_set__team')
        if getattr(self, 'action', None) in ('list', 'retrieve'):
            queryset = prefetch_image_relations(queryset, self.request)
        return queryset

    @action(detail=True, methods=['GET'], name='get image tiles for open seadragon', 
                url_path= r'(?P<z_dimension>\d+)/(?P<frame>\d+)/tile_files/(?P<level>\d+)/(?P<tile_path>\d+_\d+.(?:png|jpeg))')
    def view_image_tile(self, request, pk, z_dimension, frame, level, tile_path):

        image_id, z_dimension, frame, level = int(pk), int(z_dimension), int(frame), int(level)
        results = re.search(r"(\d+)_(\d+).(png|jpeg)", tile_path)
        col = int(results.group(1))
        row = int(results.group(2))
        format = results.group(3)
        cache_key = f"{image_id}/{z_dimension}/{frame}/{level}/{col}/{row}"

        if token_team_ids(request) is not None:
            # cached tiles are served without a lookup, so check the scope first
            check_team(request, get_object_or_404(models.Image, id=image_id).image_set.team_id)

        buffer = tiles_cache.get(cache_key)
        if buffer is not None:
            return cache_in_browser(HttpResponse(buffer, content_type='image/%s' % format))

        image = get_object_or_404(models.Image, id=image_id)            
        check_team(request, image.image_set.team_id)
        file_path = os.path.join(settings.IMAGE_PATH, image.path(z_dimension, frame))

        try:
            slide = image_cache.get(file_path)

            tile = slide.get_tile(level, (col, row), frame=frame)

            buf = PILBytesIO()
            tile.save(buf, format, quality=90)
            buffer = buf.getvalue()
                

            if hasattr(cache, "delete_pattern"):
                tiles_cache.set(cache_key, buffer, 7*24*60*60)
            return cache_in_browser(HttpResponse(buffer, content_type='image/%s' % format))
        except:
            return HttpResponseBadRequest()


    @action(detail=True, methods=['GET'], name='get image infos for open seadragon',
                url_path= r'(?P<z_dimension>\d+)/(?P<frame>\d+)/tile')
    def view_image(self, request, pk, z_dimension, frame):
        z_dimension, frame = int(z_dimension), int(frame)
        image = get_object_or_404(models.Image, id=pk)
        check_team(request, image.image_set.team_id)

        cache_key = f"{pk}_{z_dimension}_{frame}_get_dzi"
        value = cache.get(cache_key)
        if value is not None:
            return HttpResponse(value, content_type='application/xml')
        
        file_path = os.path.join(settings.IMAGE_PATH, image.path(z_dimension, frame))
        slide = image_cache.get(file_path)
        value = slide.get_dzi("jpeg")

        if hasattr(cache, "delete_pattern"):
            cache.set(cache_key, value, None)
        return HttpResponse(value, content_type='application/xml')

    @action(detail=True, methods=['PATCH'], name='Updates the image cache')
    def update_image_cache(self, request, pk=None):

        image = get_object_or_404(models.Image, id=pk)
        check_team(request, image.image_set.team_id)

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

                        tile = slide.get_tile(level=level, address=(col, row), frame=frame)

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

        buffer = cache.get(f"{pk}_thumbnail")
        if buffer is not None:
            return cache_in_browser(HttpResponse(buffer, content_type='image/png'))

        image = get_object_or_404(models.Image, id=pk)
        check_team(request, image.image_set.team_id)
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

        return cache_in_browser(HttpResponse(buffer, content_type='image/png'))

    @action(detail=True, methods=['GET'], name='Get slide information from image PK')
    def slide_information(self, request, pk=None):

        buffer = cache.get(f"{pk}_slide_information")
        if buffer is not None:
            return Response(buffer)

        image = get_object_or_404(models.Image, id=pk)
        check_team(request, image.image_set.team_id)

        file_path = image.path()

        slide = image_cache.get(file_path)
        level_dimensions = slide._osr.level_dimensions
        level_downsamples = slide._osr.level_downsamples
        levels = slide._osr.level_count
        level_tiles = slide.level_tiles

        buffer = {"id": pk,
                            "level_dimensions": level_dimensions, 
                            "level_downsamples": level_downsamples,
                            "level_tiles": level_tiles,
                            "levels": levels}

        cache.set(f"{pk}_slide_information", buffer, None)

        return Response(buffer)

    @action(detail=True, methods=['GET'], name='Get patch for image PK')
    def get_patch(self, request, pk=None):
        image = get_object_or_404(models.Image, id=pk)
        check_team(request, image.image_set.team_id)

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
        check_team(request, source_image.image_set.team_id)
        target_image = get_object_or_404(models.Image, id=int(request.data.get("target_image", 0)))
        check_team(request, target_image.image_set.team_id)

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
        check_team(request, imageset.team_id)
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
#            print('Magic number: ',hex(magic_number))
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
                # remove mrxs dat files
                if any(".mrxs" in f for f in filenames):
                    filenames = [name for name in filenames if ".mrxs" in name]
                if any(".vsi" in f for f in filenames):
                    filenames = [name for name in filenames if ".vsi" in name]
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
                print('Saving each file')
                try:
                    fchecksum = file_list[path]

                    path = Path(path)
                    name = path.name

                    if (Path(path).suffix.lower().endswith(".pdf") or Path(path).suffix.lower().endswith(".docx") or Path(path).suffix.lower().endswith(".xlsx") or 
                        Path(path).suffix.lower().endswith(".doc") or Path(path).suffix.lower().endswith(".csv") or Path(path).suffix.lower().endswith(".txt") or 
                        Path(path).suffix.lower().endswith(".xls") or Path(path).suffix.lower().endswith(".pptx") or Path(path).suffix.lower().endswith(".ppt") or  
                        Path(path).suffix.lower().endswith(".json") or Path(path).suffix.lower().endswith(".sqlite")):
                        # This is an auxiliary file, not an image. 
                        newFile = models.AuxiliaryFile(image_set=imageset, name=name, filesize=os.path.getsize(path))
                        images.append(newFile)

                    else:


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
        check_team(request, image.image_set.team_id)
        # remove image from file system
        if Path(image.path()).exists() and Path(image.path()).is_dir(): os.remove(image.path())
        if Path(image.original_path()).exists(): os.remove(image.original_path())
        # remove from tile cache
        if hasattr(cache, "delete_pattern"):
            cache_key = f"*{pk}/*/*/*/*/*"
            tiles_cache.delete_pattern(cache_key)        
        # remove thumbnail from file system
        if Path(image.thumbnail_path()).exists(): os.remove(image.thumbnail_path())
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

def prefetch_image_relations(queryset, request, prefix=''):
    """
    Prefetch the relations of images that are part of the response (frame descriptions and the ids of the annotations),
    so that they are loaded with one query for all images instead of one query per image.
    `prefix` is the path to the images if they are nested in another response (e.g. 'images.' for image sets).
    """
    lookup = prefix.replace('.', '__')
    if serializes_field(request, 'FrameDescriptions') or prefix:
        if not omits_nested(request, prefix + 'FrameDescriptions'):
            queryset = queryset.prefetch_related(lookup + 'FrameDescriptions')
    if (serializes_field(request, 'annotations') or prefix) and not omits_nested(request, prefix + 'annotations'):
        if expands_field(request, 'annotations') and not prefix:
            queryset = queryset.prefetch_related('annotations')
        else:
            # only the ids of the annotations are part of the response
            from exact.annotations.models import Annotation
            queryset = queryset.prefetch_related(Prefetch(lookup + 'annotations',
                                                          queryset=Annotation.objects.only('id', 'image_id')))
    return queryset


class ImageSetViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.ImageSet.objects.all().select_related('team', 'creator', 'main_annotation_type')
    serializer_class = serializers.ImageSetSerializer
    filterset_class = ImageSetFilterSet
    #renderer_classes = (renderers.JSONRenderer, renderers.TemplateHTMLRenderer)

    def get_queryset(self):
        user = self.request.user
        queryset = scope_queryset(self.request, models.ImageSet.objects.filter(team__in=user.team_set.all()), 'team').select_related('team', 'creator', 'main_annotation_type').order_by('id')
        if getattr(self, 'action', None) in ('list', 'retrieve'):
            request = self.request
            if expands_field(request, 'images'):
                # the images (with their relations) are part of the response
                queryset = prefetch_image_relations(queryset.prefetch_related('images'), request, prefix='images.')
            elif serializes_field(request, 'images'):
                # only the ids of the images are part of the response
                queryset = queryset.prefetch_related(Prefetch('images', queryset=models.Image.objects.only('id', 'image_set_id')))
        return queryset


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

        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)
        
        # fust but buggy find a fix! not updated if the image set is changed in any way for example rights changed
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
        return scope_queryset(self.request, models.SetTag.objects.filter(imagesets__team__in=user.team_set.all()), 'imagesets__team').distinct().order_by('id')

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
        return scope_queryset(self.request, models.SetVersion.objects.filter(imagesets__team__in=user.team_set.all()), 'imagesets__team').order_by('id')

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
        if token_team_ids(request) is not None and not set_version.imagesets.filter(team__in=token_team_ids(request)).exists():
            raise Http404

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
        return scope_queryset(self.request, models.ScreeningMode.objects.filter(image__image_set__team__in=user.team_set.all()), 'image__image_set__team').select_related('image', 'user').order_by('id')

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
        return scope_queryset(self.request, models.ImageRegistration.objects.filter(source_image__image_set__team__in=user.team_set.all()), 'source_image__image_set__team').select_related('source_image', 'target_image').order_by('id')


    @action(detail=True, methods=['GET'], name='Convert coordinates form the source to the target domain')
    def convert_coodinates(self, request, pk=None):
        image_registration = get_object_or_404(models.ImageRegistration, id=pk)   
        check_team(request, image_registration.source_image.image_set.team_id)

        vector = request.query_params.get("vector", None) 
        if vector is None:
            return HttpResponseBadRequest('vector parameter not set')

        vector = json.loads(vector.replace("\'", "\""))

        result_vector = image_registration.convert_coodinates(vector)

        return Response(result_vector, HTTP_202_ACCEPTED)


    @action(detail=True, methods=['GET'], name='Convert coordinates form the source to the target domain')
    def create_inverse_registration(self, request, pk=None):
        image_registration = get_object_or_404(models.ImageRegistration, id=pk)   
        check_team(request, image_registration.source_image.image_set.team_id)

        new_registration = image_registration.create_inverse_registration()

        return Response(serializers.ImageRegistrationSerializer(new_registration).data, HTTP_201_CREATED)