import ast
import logging
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import transaction
from django.db import connection
from django.db.models import Count, Q, Sum
from django.db.models.expressions import F
from django.views.decorators.http import require_http_methods
from django.urls import reverse
from django.http import HttpResponseForbidden, HttpResponse, HttpResponseBadRequest, JsonResponse, \
    FileResponse, HttpRequest, StreamingHttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template.response import TemplateResponse
from django.utils.translation import gettext_lazy as _
from django.core.cache import caches
from json import JSONDecodeError
from io import BytesIO
from util.slide_server import getSlideHandler

import pyvips

from exact.processing.models import Plugin, PluginJob, PluginResult
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ParseError
from rest_framework.response import Response
from rest_framework.authentication import BasicAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.status import HTTP_403_FORBIDDEN, HTTP_200_OK, \
    HTTP_201_CREATED, HTTP_202_ACCEPTED, HTTP_204_NO_CONTENT, HTTP_404_NOT_FOUND
from PIL import Image as PIL_Image
from django.views.decorators.cache import cache_page

from rest_framework.settings import api_settings

from exact.images.api_views import ImageSetViewSet
from exact.images.serializers import ImageSetSerializer, ImageSerializer, SetTagSerializer, serialize_imageset, AuxiliaryFileSerializer
from exact.images.forms import ImageSetCreationForm, ImageSetCreationFormWT, ImageSetEditForm
from exact.annotations.views import api_copy_annotation
from exact.users.forms import TeamCreationForm
from exact.users.models import User, Team
from exact.tagger_messages.forms import TeamMessageCreationForm
from exact.administration.models import Product
from exact.administration.serializers import ProductSerializer

from .models import ImageRegistration, ImageSet, Image, SetTag, AuxiliaryFile
from .forms import LabelUploadForm, CopyImageSetForm
from exact.annotations.models import Annotation, Export, ExportFormat, \
    AnnotationType, Verification, LogImageAction
from exact.tagger_messages.models import Message, TeamMessage, GlobalMessage

from util.slide_server import SlideCache, SlideFile, PILBytesIO
from util.cellvizio import ReadableCellVizioMKTDataset # just until data access is pip installable

from plugins.pluginFinder import PluginFinder
from plugins.ExactServerPlugin import UpdatePolicy, ViewPolicy, NavigationViewOverlayStatus

import platform
import os, stat
import shutil
from shutil import which
import string
import random
import zipfile
import hashlib
import json
import imghdr
from timeit import default_timer as timer
from datetime import date, timedelta, datetime
from pathlib import Path
import re
import math
import numpy as np
from multiprocessing.pool import ThreadPool
import subprocess
import cv2
import tifffile
import openslide
from openslide import OpenSlide, open_slide
from PIL import Image as PIL_Image
from czifile import czi2tif
from django.core.cache import cache

# TODO: Add to cache
logger = logging.getLogger('django')
image_cache = SlideCache(cache_size=10)
plugin_finder = PluginFinder(image_cache)

cache = caches['default']
try:
    tiles_cache = caches['tiles_cache']
except:
    tiles_cache = cache


def file_iterator(file_obj, chunk_size=8192):
    while chunk := file_obj.read(chunk_size):
        yield chunk

@login_required
def explore_imageset(request, *args, **kwargs):
    # TODO: depricated
    if hasattr(request, 'query_params') ==  False:
        request.query_params = request.GET
    view_set = ImageSetViewSet(request=request)

    imagesets = view_set.filter_queryset(view_set.get_queryset()).order_by('team')

    query = request.GET.get('query')
    tagfilter = request.GET.get('tags')
    get_query = ''
    get_tagfilter = ''
    tag_names = None
    if query:
        imagesets = imagesets.filter(name__icontains=query)
        get_query = '&query=' + str(query)
    if tagfilter:
        tag_names = str(tagfilter).replace(' ', '').split(',')
        for tag_name in tag_names:
            if tag_name.replace(' ', ''):
                imagesets = imagesets.filter(set_tags__name=tag_name)
        get_tagfilter = '&tags=' + str(tagfilter)

    paginator = Paginator(imagesets, api_settings.PAGE_SIZE)
    page = request.GET.get('page')
    page_imagesets = paginator.get_page(page)

    return TemplateResponse(request, 'base/explore.html', {
        'mode': 'imageset',
        'imagesets': page_imagesets,  # to separate what kind of stuff is displayed in the view
        'paginator': page_imagesets,  # for page stuff
        'get_query': get_query,
        'get_tagfilter': get_tagfilter,
        'tagnames': tag_names,  # currently not used
        'tagfilter': tagfilter,
        'query': query,
    })


@api_view(['GET', 'POST'])
def api_index(request:HttpRequest):
    try:
        id = request.data.get('id', None)
        team = request.data.get('team', None)
        name = request.data.get('name', None)
        description = request.data.get('description', None)
        public = request.data.get('public', None)

    except (KeyError, TypeError, ValueError):
        raise ParseError

    if not request.user.is_authenticated:
        return Response({},HTTP_403_FORBIDDEN)
    userteams = Team.objects.filter(members=request.user)

    imagesets = ImageSet.objects.filter(team__in=userteams).annotate(
        image_count_agg=Count('images')
    ).select_related('team').prefetch_related('set_tags') \
        .order_by('-priority', '-time')

    if id is not None and id > 0:
        imagesets = imagesets.filter(id=id)
    if team is not None:
        imagesets = imagesets.filter(team=team['id'])
    if name is not None:
        imagesets = imagesets.filter(name__contains=name)
    if description is not None:
        imagesets = imagesets.filter(description__contains=description)
    if public is not None:
        imagesets = imagesets.filter(public=public)

    result = [serialize_imageset(imageset) for imageset in imagesets]
    return Response(result, HTTP_200_OK)
    


@login_required
def index(request):
    team_creation_form = TeamCreationForm()

    # needed to show the list of the users imagesets
    userteams = Team.objects.filter(members=request.user)
    # get all teams where the user is an admin
    user_admin_teams = Team.objects.filter(memberships__user=request.user, memberships__is_admin=True)

    imageset_creation_form = ImageSetCreationFormWT()  # the user provides the team manually
    imageset_creation_form.fields['team'].queryset = userteams

    last_image_action = LogImageAction.objects.filter(user=request.user).order_by('-time').first()

    template = 'images/index_v2.html' if hasattr(request.user,'ui') and hasattr(request.user.ui,'frontend') and request.user.ui.frontend==2 else 'images/index.html'

    return TemplateResponse(request, template, {
        'last_image_action': last_image_action,
        'user': request.user,
        'team_creation_form': team_creation_form,
        'imageset_creation_form': imageset_creation_form,
        'user_has_admin_teams': user_admin_teams.exists(),
        'userteams': userteams,
    })


@api_view(['POST'])
def upload_image(request, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    if request.method == 'POST' \
            and imageset.has_perm('edit_set', request.user) \
            and not imageset.image_lock:
        if request.FILES is None:
            return HttpResponseBadRequest('Must have files attached!')
        json_files = []
        errors = []
        for f in list(request.FILES.values()):#request.FILES.getlist('files[]'):
            error = {
                'duplicates': 0,
                'damaged': False,
                'directories': False,
                'exists': False,
                'unsupported': False,
                'zip': False,
                'convert': False
            }
#            file_list['test'] = str(f)
            magic_number = f.read(4)
            f.seek(0)  # reset file cursor to the beginning of the file

            file_list = {}
            print('Magic number: ',str(magic_number))
            if magic_number == b'PK\x03\x04':  # ZIP file magic number
                error['zip'] = True
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
                filenames = [f.filename for f in zip_ref.filelist]

                # remove mrxs dat files
                if any(".mrxs" in f.lower() for f in filenames):
                    filenames = [name for name in filenames if ".mrxs" in name]
                # remove vms data files
                # check if vms is in any images then just save the vms files
                # else for each jpg a new image will be created in the databse
                if any(".vms" in f.lower() for f in filenames):
                    filenames = [name for name in filenames if ".vms" in name]
                
                # Clean other files from list if any vsi files were in the zip
                if any(".vsi" in f.lower() for f in filenames):
                    filenames = [name for name in filenames if ".vsi" in name]

                filenames.sort()
                duplicat_count = 0
                for filename in filenames:

                    file_path = os.path.join(imageset.root_path(), filename)
                    if Image.objects.filter(Q(filename=filename)|Q(name=f.name),
                                            image_set=imageset).count() == 0:

                        try:
                            # creates a checksum for image
                            fchecksum = hashlib.sha512()
                            with open(file_path, 'rb') as fil:
                                while True:
                                    buf = fil.read(10000)
                                    fchecksum.update(buf)
                                    break
                            fchecksum = fchecksum.digest()

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
                print('Creating file checksum... for file', f.name)
                # creates a checksum for image
                fchecksum = hashlib.sha512()
                for chunk in f.chunks():
                    fchecksum.update(chunk)
                fchecksum = fchecksum.digest()

                filename = os.path.join(imageset.root_path(), f.name)
                # tests for duplicats in  imageset
                image = Image.objects.filter(Q(filename=filename)|Q(name=f.name), checksum=fchecksum,
                                        image_set=imageset).first()
                print('Image:',image)
                if image is None:

                    with open(filename, 'wb') as out:
                        for chunk in f.chunks():
                            out.write(chunk)

                    file_list[filename] = fchecksum
                else:
                    error['exists'] = True
                    error['exists_id'] = image.id

                print('File_list:',file_list)


            for path in file_list:
                print('Working on ',path)

                try:
                    fchecksum = file_list[path]

                    path = Path(path)
                    name = path.name

                    if (Path(path).suffix.lower().endswith(".csv") or Path(path).suffix.lower().endswith(".txt") or 
                        Path(path).suffix.lower().endswith(".json") or Path(path).suffix.lower().endswith(".sqlite")):
                        # This is an auxiliary file, not an image. 

                        image = AuxiliaryFile(image_set=imageset, name=name, filesize=os.path.getsize(path), creator = request.user)
                        image.save()
                        type='auxfile'

                    else:
                        image = Image(
                            name=name,
                            image_set=imageset,
                            checksum=fchecksum)
                        type='image'
                        image.save_file(path)
                except Exception as e:
                    import sys
                    import traceback
                    exc_type, exc_obj, exc_tb = sys.exc_info()
                    fname = os.path.split(exc_tb.tb_frame.f_code.co_filename)[1]
                    err = f'{e.__class__} {e} {exc_type}, {fname}, {exc_tb.tb_lineno}'
                    traceback.print_exception(exc_obj, exc_type, exc_tb )
                    logger.error(err)
                    errors.append(err)

            errormessage = ''
            if error['zip']:
                errors = list()
                if error['directories']:
                    errors.append('directories')
                if error['unsupported']:
                    errors.append('unsupported files')
                if error['duplicates'] > 0:
                    errors.append(str(error['duplicates']) + ' duplicates')
                if error['damaged']:
                    errors.append('damaged files')
                if len(errors) > 0:
                    # Build beautiful error message
                    errormessage += ', '.join(errors) + ' in the archive have been skipped!'
                    p = errormessage.rfind(',')
                    if p != -1:
                        errormessage = errormessage[:p].capitalize() + ' and' + errormessage[p + 1:]
                    else:
                        errormessage = errormessage.capitalize()
            else:
                if error['convert']:
                    errormessage = 'Imagemagick not installed or can not be accessed from command line via convert' 
                if error['unsupported']:
                    errormessage = 'This file type is unsupported!'
                elif error['damaged']:
                    errormessage = 'This file seems to be damaged!'
                elif error['exists']:
                    errormessage = 'This image already exists in the imageset!'
            if errormessage == '':
                json_files.append({'name': f.name,
                                   'size': f.size,
                                   'type': type,
                                   'id' : image.id,
                                   })
            else:
                json_files.append({'name': f.name,
                                   'size': f.size,
                                   'error': errormessage,
                                   'id': error.get('exists_id', -1)
                                   })

        return JsonResponse({'files': json_files})


# @login_required
# def imageview(request, image_id):
#     image = get_object_or_404(Image, id=image_id)
#     with open(os.path.join(settings.IMAGE_PATH, image.path()), "rb") as f:
#         return HttpResponse(f.read(), content_type="image/jpeg")

@login_required
@cache_page(60 * 60 * 24 * 30)
def view_image(request, image_id, z_dimension:int=1, frame:int=1):
    """
    This view is to authenticate direct access to the images via nginx auth_request directive

    it will return forbidden on if the user is not authenticated
    """
    z_dimension, frame = int(z_dimension), int(frame)
    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    cache_key = f"{image_id}_{z_dimension}_{frame}_get_dzi"
    value = cache.get(cache_key)
    if value is not None:
        return HttpResponse(value, content_type='application/xml')
    
    file_path = os.path.join(settings.IMAGE_PATH, image.path(z_dimension, frame))
    slide = image_cache.get(file_path)
    value = slide.get_dzi("jpeg")

    if hasattr(cache, "delete_pattern"):
        cache.set(cache_key, value, None)
    return HttpResponse(value, content_type='application/xml')

@login_required
@api_view(['GET'])
def image_plugins(request) -> Response:
    try:
        result = json.loads(request.query_params.get('values'))
        image_id = int(result['image_id'])
        options = result['options']
    except (KeyError, TypeError, ValueError):
        raise ParseError

    image = get_object_or_404(Image, pk=image_id)

    if not image.image_set.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    plugins = []
    # add all plugins with a matching name
    # TODO: Add Plugins to product properties like products
    for product in image.image_set.product_set.all():
        for plugin in plugin_finder.filter_plugins(product_name=product.name):
            plugins.append(plugin.instance.getPluginStatisticsElements(image, request.user, options))
    # add all default plugins
    #for plugin in plugin_finder.filter_plugins(product_name=''):
    #    plugins.append(plugin.instance.getPluginStatisticsElements(image, request.user, options))


    return Response({
        'plugins': plugins,
    }, status=HTTP_200_OK)


@login_required
@api_view(['GET'])
def navigator_overlay_status(request) -> Response:
    try:
        image_id = int(request.query_params['image_id'])
    except (KeyError, TypeError, ValueError):
        raise ParseError

    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    # replace with databse call to imageset.product
    for product in image.image_set.product_set.all():
        for plugin in plugin_finder.filter_plugins(product_name=product.name, navigation_view_policy=ViewPolicy.RGB_IMAGE):

            status = plugin.instance.getNavigationViewOverlayStatus(image)
            if status == NavigationViewOverlayStatus.ERROR:
                return Response({}, status=HTTP_204_NO_CONTENT)
            elif status == NavigationViewOverlayStatus.NEEDS_UPDATE:
                plugin.instance.updateNavigationViewOverlay(image)
                return Response({}, status=HTTP_200_OK)
            else:
                return Response({}, status=HTTP_200_OK)

    return Response({}, status=HTTP_204_NO_CONTENT)



@login_required
def view_image_navigator_overlay_tile(request, image_id, z_dimension, frame, level, tile_path):
    """
    This view is to authenticate direct access to the images via nginx auth_request directive

    it will return forbidden on if the user is not authenticated
    """
    image_id, z_dimension, frame, level = int(image_id), int(z_dimension), int(frame), int(level)
    results = re.search(r"(\d+)_(\d+).(png|jpeg)", tile_path)
    col = int(results.group(1))
    row = int(results.group(2))
    format = results.group(3)

    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    file_path = os.path.join(settings.IMAGE_PATH, image.path())
    slide = image_cache.get(file_path)

    tile = slide.get_tile(level, (col, row), frame=min(frame, image.frames-1))
 
    # replace with databse call to imageset.product
    for product in image.image_set.product_set.all():
        for plugin in plugin_finder.filter_plugins(product_name=product.name, navigation_view_policy=ViewPolicy.RGB_IMAGE):
            tile = plugin.instance.getNavigationViewOverlay(image)

    buf = PILBytesIO()
    tile.save(buf, format, quality=90)
    response = HttpResponse(buf.getvalue(), content_type='image/%s' % format)

    return response

@login_required
#@cache_page(60 * 60 * 24 * 30)
def view_image_tile(request, image_id, z_dimension, frame, level, tile_path):
    """
    This view is to authenticate direct access to the images via nginx auth_request directive

    it will return forbidden on if the user is not authenticated
    """
    image_id, z_dimension, frame, level = int(image_id), int(z_dimension), int(frame), int(level)
    results = re.search(r"(\d+)_(\d+).(png|jpeg)", tile_path)
    col = int(results.group(1))
    row = int(results.group(2))
    format = results.group(3)
    cache_key = f"{image_id}/{z_dimension}/{frame}/{level}/{col}/{row}"

    start = timer()
    buffer = tiles_cache.get(cache_key)
    if buffer is not None:
        load_from_drive_time = timer() - start
        #logger.info(f"{load_from_drive_time:.4f};{request.path};C")
        return HttpResponse(buffer, content_type='image/%s' % format)

    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()
        
    file_path = os.path.join(settings.IMAGE_PATH, image.path(z_dimension, frame))

    try:
        slide = image_cache.get(file_path)

        tile = slide.get_tile(level, (col, row),frame=min(frame, image.frames-1))

        buf = PILBytesIO()
        tile.save(buf, format, quality=90)
        buffer = buf.getvalue()
            
        load_from_drive_time = timer() - start

        #logger.info(f"{load_from_drive_time:.4f};{request.path};NC")

        if hasattr(cache, "delete_pattern"):
            tiles_cache.set(cache_key, buffer, 7*24*60*60)
        return HttpResponse(buffer, content_type='image/%s' % format)
    except Exception as e:
        print('Error: ',e)
        return HttpResponseBadRequest()


@api_view(['GET'])
def list_images(request, image_set_id):
    imageset = get_object_or_404(ImageSet, id=image_set_id)
    if not imageset.has_perm('read', request.user):
        return HttpResponseForbidden()
    return TemplateResponse(request, 'images/imagelist.txt', {
        'images': imageset.images.all()
    })


@login_required
@api_view(['GET'])
def image_opened(request, image_id):

    image = get_object_or_404(Image, id=image_id)

    if image.image_set.team not in request.user.team_set.all():
        return Response({}, status=HTTP_403_FORBIDDEN)


    with transaction.atomic():
        LogImageAction.objects.create(
            image=image,
            user=request.user,
            action=LogImageAction.ActionType.OPEN,
            ip=LogImageAction.get_ip_fom_request(request)
        )

    return Response({
    }, status=HTTP_200_OK)


@login_required
@api_view(['GET'])
def image_closed(request, image_id):
    image = get_object_or_404(Image, id=image_id)

    # TODO: Check permission
    if image.image_set.team not in request.user.team_set.all():
        return Response({}, status=HTTP_403_FORBIDDEN)

    with transaction.atomic():
        LogImageAction.objects.create(
            image=image,
            user=request.user,
            action=LogImageAction.ActionType.CLOSED,
            ip=LogImageAction.get_ip_fom_request(request)
        )

    return Response({
    }, status=HTTP_200_OK)


@api_view(['GET'])
def download_image_api(request, image_id) -> Response:
    original_image = request.GET.get("original_image", None)
    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return Response({'message': 'you do not have the permission to access this imageset'
        }, status=HTTP_403_FORBIDDEN)

    file_path = Path(settings.IMAGE_PATH) / image.path()
    if original_image is not None and 'True' == original_image:
        file_path =  Path(image.original_path())
    
    if file_path.suffix.upper() == '.MRXS': # MRXS files need to be zipped before
        # strip the suffix
        folder_path = file_path.with_suffix('')
        content = BytesIO()

        with zipfile.ZipFile(content, 'w') as f:
                for filename in os.listdir(str(folder_path)):
                    f.write(os.path.join(str(folder_path), filename), os.path.join(folder_path.parts[-1],filename))
                f.write(str(file_path), file_path.parts[-1])

        content.seek(0)
        response = StreamingHttpResponse(file_iterator(content), content_type='application/zip')
        response['Content-Disposition'] = "attachment; filename={}".format(file_path.name+'.zip')
    elif file_path.suffix.upper() == '.VSI': # VSI files have to be zipped before as well, but using a different naming scheme
        # strip the suffix and add underscores around the stem. This is weird, but thats how Olympus do it.
        folder_path = file_path.with_suffix('')
        folder_path = folder_path.parent / f"_{folder_path.stem}_"

        content = BytesIO()
        with zipfile.ZipFile(content, 'w') as f:
                for subfolder in folder_path.iterdir():
                    subfolder_path = folder_path / subfolder.name
                    archive_subfolder = Path(folder_path.parts[-1]) / subfolder.name
                    f.write(subfolder_path, str(archive_subfolder))

                    # Check if subfolder_path is actually a directory before listing files
                    if subfolder_path.is_dir():
                        for file in subfolder_path.iterdir():
                            archive_file_path = archive_subfolder / file.name
                            f.write(file, str(archive_file_path))

                # Ensure the original VSI file is included in the correct location
                archive_vsi_path = Path(folder_path.parts[-1]) / file_path.name
                f.write(file_path, str(archive_vsi_path))
        content.seek(0)
        response = StreamingHttpResponse(file_iterator(content), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{file_path.name}.zip"'
    else:
        response = FileResponse(open(str(file_path), 'rb'), content_type='application/zip')

        response['Content-Length'] = os.path.getsize(file_path)
        response['Content-Disposition'] = "attachment; filename={}".format(file_path.name)

    return response

@api_view(['GET'])
def download_auxfile_api(request, auxfile_id) -> Response:
    original_image = request.GET.get("original_image", None)
    image = get_object_or_404(AuxiliaryFile, id=auxfile_id)
    if not image.image_set.has_perm('read', request.user):
        return Response({'message': 'you do not have the permission to access this imageset'
        }, status=HTTP_403_FORBIDDEN)

    file_path = Path(settings.IMAGE_PATH) / image.path()
    if original_image is not None and 'True' == original_image:
        file_path =  Path(image.original_path())
    
    
    response = FileResponse(open(str(file_path), 'rb'), content_type='application/octet-stream')

    response['Content-Length'] = os.path.getsize(file_path)
    response['Content-Disposition'] = "attachment; filename={}".format(file_path.name)

    return response

@api_view(['GET'])
def delete_images_api(request, image_id) -> Response:
    image = get_object_or_404(Image, id=image_id)
    if image.image_set.has_perm('delete_images', request.user) and not image.image_set.image_lock:
        try:
            if Path(image.path()).exists(): os.remove(image.path())
            if Path(image.original_path()).exists(): os.remove(image.original_path())
        except:
            pass
        image.delete()
        return Response({}, status=HTTP_200_OK)
    return Response({}, status=HTTP_403_FORBIDDEN)


@login_required
def delete_images(request, image_id):
    image = get_object_or_404(Image, id=image_id)
    if image.image_set.has_perm('delete_images', request.user) and not image.image_set.image_lock:
        if Path(image.path()).exists(): os.remove(image.path())
        if Path(image.original_path()).exists(): os.remove(image.original_path())

        image.delete()
        next_image = request.POST.get('next-image-id', '')
        if next_image == '':
            return redirect(reverse('images:view_imageset', args=(image.image_set.id,)))
        else:
            return redirect(reverse('annotations:annotate', args=(next_image,)))


@login_required
def delete_jobs(request, plugin_id, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    plugin = get_object_or_404(Plugin, id=plugin_id)

    pluginjobs=PluginJob.objects.filter(image__in=imageset.images.all()).filter(plugin=plugin)

    for job in pluginjobs:
        results = PluginResult.objects.filter(job=job.id).delete()
        
        job.delete()

    return redirect(reverse('images:view_imageset', args=(imageset.id,)))


@login_required
def view_imageset(request, image_set_id):
    # TODO: Cache
    imageset = get_object_or_404(ImageSet, id=image_set_id)
    if not imageset.has_perm('read', request.user):
        messages.warning(request, 'you do not have the permission to access this imageset')
        return redirect(reverse('images:index'))

    # the saved exports of the imageset
    exports = Export.objects.filter(image_set=image_set_id).order_by('-id')[:5]
    filtered = False
    form_filter = request.POST.get('filter')
    if request.method == "POST" and form_filter is not None:
        # images the imageset contains
        images = imageset.get_unverified_ids(request.user)

        filtered = True
        # filter images for missing annotationtype
        images = images.exclude(
            annotations__annotation_type_id=request.POST.get("selected_annotation_type"))


    annotation_types = AnnotationType.objects.filter(product__in=imageset.product_set.all(), active=True)
    
    user_teams = Team.objects.filter(members=request.user)

    image_sets = ImageSet.objects.filter(team__in=user_teams)



    imageset_edit_form = ImageSetEditForm(instance=imageset)
    imageset_edit_form.fields['main_annotation_type'].queryset = AnnotationType.objects\
        .filter(active=True, product__in=imageset.product_set.all()).order_by('product', 'sort_order')

    copyImageSetForm = CopyImageSetForm()
    copyImageSetForm.fields['imagesets'].queryset = ImageSet.objects\
        .filter(Q(team__in=request.user.team_set.all())|Q(public=True))

    availablePlugins = Plugin.objects.filter(products__in=imageset.product_set.all())
    for i,plugin in enumerate(availablePlugins):
        pgn=PluginJob.objects.filter(image__in=imageset.images.all()).filter(plugin=plugin)
        availablePlugins[i].alljobs = pgn

    showRegTab=False
    if ('delete-registration' in request.POST):
        print('delReg',request.POST['delete-registration'])
        regid = int(request.POST['delete-registration'])
        image_registration = ImageRegistration.objects.filter(id=regid).first()

#        image_registration = get_object_or_404(ImageRegistration, int(request.POST['delete-registration']))
        image_registration.delete()
        # delete registration
        showRegTab=True

    if ('manual-registration' in request.POST):
        source_image = get_object_or_404(Image, id=int(request.POST.get('registration-src')))
        target_image = get_object_or_404(Image, id=int(request.POST.get('registration-dst')))

        return redirect(reverse('images:annotate_manually', args=(source_image.id, target_image.id)))

    if ('registration-src' in request.POST) and ('registration-dst' in request.POST):
        source_image = get_object_or_404(Image, id=int(request.POST.get('registration-src')))
        target_image = get_object_or_404(Image, id=int(request.POST.get('registration-dst')))

        image_registration = ImageRegistration.objects.filter(source_image=source_image, target_image=target_image).first()        

        maxFeatures=int(request.POST['maxFeatures'])
        thumbnail_size=(int(request.POST['thumbnail_size_1']),int(request.POST['thumbnail_size_2']))
        filter_outliner=int(request.POST['filter_outliner'])
        maxFeatures=int(request.POST['maxFeatures'])
        use_gray=int(request.POST['use_gray'])
        target_depth=int(request.POST['target_depth'])
        point_extractor='orb' if (request.POST['point_extractor'] == 'orb') else 'sift'
        flann=1 if (request.POST['flann']=='1') else 0
        scale=float(request.POST['scale'])


        # register the two images
        if image_registration is None:

            image_registration = ImageRegistration(source_image=source_image, target_image=target_image)        
        
        image_registration.perform_registration(maxFeatures=maxFeatures, thumbnail_size=thumbnail_size, filter_outliner=filter_outliner,
                                                use_gray=use_gray, target_depth=target_depth, point_extractor=point_extractor, flann=flann,
                                                scale=scale) # use default parameters for now
        showRegTab=True

    image_registration_src = ImageRegistration.objects.filter(source_image_id__in=imageset.images.all())       
    image_registration_trg = ImageRegistration.objects.filter(target_image_id__in=imageset.images.all())       


    if ('target_imageset_id' in request.GET):
        showRegTab=True
        target_imageset = get_object_or_404(ImageSet, id=int(request.GET['target_imageset_id']))
        

    else:
        
        target_imageset=imageset

    all_products = Product.objects.filter(team=imageset.team).order_by('name')
    template = 'images/imageset_v2.html' if hasattr(request.user,'ui') and hasattr(request.user.ui,'frontend') and request.user.ui.frontend==2 else 'images/imageset.html'
    return render(request, template, {
        'image_count': imageset.images.count(),
        'imageset': imageset,
        'target_imageset' : target_imageset,
        'imagesets' : image_sets,
        'availablePlugins': availablePlugins,
        'real_image_number': imageset.images.filter(~Q(image_type=Image.ImageSourceTypes.SERVER_GENERATED)).count(),
        'computer_generated_image_number' : imageset.images.filter(Q(image_type=Image.ImageSourceTypes.SERVER_GENERATED)).count(),
        'all_products': all_products,
        'annotation_types': annotation_types,
        'exports': exports,
        'api': request.build_absolute_uri('/api/'),
        'filtered': filtered,
        'showRegTab' : showRegTab,
        'edit_form': imageset_edit_form,
        'image_registration_src' : image_registration_src,
        'image_registration_trg' : image_registration_trg,
        'imageset_perms': imageset.get_perms(request.user),
        'export_formats': ExportFormat.objects.filter(Q(public=True) | Q(team__in=user_teams)),
        'label_upload_form': LabelUploadForm(),
        'copy_imagesets_form': copyImageSetForm,
        'upload_notice': settings.UPLOAD_NOTICE,
        'enable_zip_download': settings.ENABLE_ZIP_DOWNLOAD,
        'user': request.user
    })


#@login_required
@api_view(['GET'])
def image_statistics(request) -> Response:
    try:
        image_id = int(request.query_params['image_id'])
    except (KeyError, TypeError, ValueError):
        raise ParseError

    image = get_object_or_404(Image, pk=image_id)

    if not image.image_set.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if image.image_set.collaboration_type == ImageSet.CollaborationTypes.COLLABORATIVE:
        annotation_types = AnnotationType.objects.filter(annotation__image=image, active=True, annotation__deleted=False)\
            .distinct().order_by('sort_order')\
            .annotate(count=Count('annotation'),
                      in_image_count=Count('annotation', filter=Q(annotation__vector__isnull=False)),
                      verified_count=Count('annotation', filter=Q(annotation__vector__isnull=False, annotation__verifications__verified=True)),
                      unverified_count=Count('annotation', filter=Q(annotation__vector__isnull=False, annotation__verifications__verified=False)),
                      not_in_image_count=Count('annotation', filter=Q(annotation__vector__isnull=True)))

    if image.image_set.collaboration_type == ImageSet.CollaborationTypes.COMPETITIVE:
        annotation_types = AnnotationType.objects.filter(annotation__image=image, active=True, annotation__deleted=False, annotation__user=request.user)\
            .distinct().order_by('sort_order')\
            .annotate(count=Count('annotation'),
                      in_image_count=Count('annotation', filter=Q(annotation__vector__isnull=False, annotation__user=request.user)),
                      verified_count=Count('annotation', filter=Q(annotation__vector__isnull=False, annotation__verifications__verified=True, annotation__user=request.user)),
                      unverified_count=Count('annotation', filter=Q(annotation__vector__isnull=False, annotation__verifications__verified=False, annotation__user=request.user)),
                      not_in_image_count=Count('annotation', filter=Q(annotation__vector__isnull=True, annotation__user=request.user)))


    data = [t for t in annotation_types.values()]

    return Response({
        'statistics': data,
    }, status=HTTP_200_OK)

@api_view(['POST'])
def create_imageset_api(request):
    try:
        name = request.data['name']
        team = request.data['team']
        location = request.data.get('location', None)
        description = request.data.get('description', None)
        public = request.data.get('public', False)
        public_collaboration = request.data.get('public_collaboration', False)
        image_lock = request.data.get('image_lock', False)
        priority = request.data.get('priority', 0)
        main_annotation_type = request.data.get('main_annotation_type', None)
        collaboration_type = request.data.get('collaboration_type', 0)
        products = request.data.get('products', None)
    except (KeyError, TypeError, ValueError):
        raise ParseError

    team = get_object_or_404(Team, id=team['id'])
    if not team.has_perm('create_set', request.user):
        messages.warning(
            request,
            _('You do not have permission to create image sets in the team {}.')
            .format(team.name))
        return redirect(reverse('users:team', args=(team.id,)))

    with transaction.atomic():
        image_set = ImageSet.objects.create(
            team = team,
            creator = request.user,
            location = location,
            name = name,
            description = description,
            public = public,
            public_collaboration = public_collaboration,
            image_lock = image_lock,
            priority = priority,
            main_annotation_type = main_annotation_type,
            collaboration_type  =collaboration_type,
        )
        image_set.create_folder()

        for product in products:
            available_product = Product.objects.filter(id=product['id']).first()
            if available_product is not None:
                available_product.imagesets.add(image_set)
                available_product.save()

    serialized_image_set = serialize_imageset(image_set)
    return Response(serialized_image_set, status=HTTP_200_OK)
            
    

@login_required
def create_imageset(request):
    team = get_object_or_404(Team, id=request.POST['team'])

    if not team.has_perm('create_set', request.user):
        messages.warning(
            request,
            _('You do not have permission to create image sets in the team {}.')
            .format(team.name))
        return redirect(reverse('users:team', args=(team.id,)))

    form = ImageSetCreationForm()

    if request.method == 'POST':
        form = ImageSetCreationForm(request.POST)

        if form.is_valid():
            if team.image_sets\
                    .filter(name=form.cleaned_data.get('name')).exists():
                form.add_error(
                    'name',
                    _('The name is already in use by an imageset of this team.'))
            else:
                with transaction.atomic():
                    form.instance.team = team
                    form.instance.creator = request.user
                    form.instance.save()
                    form.instance.path = '{}_{}_{}'.format(connection.settings_dict['NAME'], team.id,
                                                        form.instance.id)
                    form.instance.save()

                    # create a folder to store the images of the set
                    folder_path = form.instance.root_path()
                    os.makedirs(folder_path)
                    os.chmod(folder_path, 0o777)
                    #shutil.chown(folder_path, group=settings.UPLOAD_FS_GROUP)

                messages.success(request,
                                 _('The image set was created successfully.'))
                return redirect(reverse('images:view_imageset',
                                        args=(form.instance.id,)))

    return render(request, 'images/create_imageset.html', {
        'team': team,
        'form': form,
    })

@api_view(['GET'])
@login_required
def create_annotation_map(request, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)

    if not imageset.has_perm('edit_set', request.user):
        messages.warning(request,
                         _('You do not have permission to edit this imageset.'))
        return redirect(reverse('images:view_imageset', args=(imageset.id,)))

    if (which('vips') == None):
        return Response({
            'Error': "Libvips  not installed",
        }, status=HTTP_404_NOT_FOUND)
    try:
        import pyvips
    except:
        return Response({
            'Error': "pip Libvips  not installed",
        }, status=HTTP_404_NOT_FOUND)


    # delete auto generated annotations
    Verification.objects.filter(annotation__in=
                                Annotation.objects.filter(image__image_set=imageset,
                                                          image__image_type=Image.ImageSourceTypes.SERVER_GENERATED))\
        .delete()

    Annotation.objects.filter(image__image_set=imageset,
                              image__image_type=Image.ImageSourceTypes.SERVER_GENERATED).delete()

    result_image_names = {}
    for annotation_type in AnnotationType.objects.filter(annotation__in=Annotation.objects
            .filter(image__image_set=imageset, deleted=False)).distinct():
        annotations = Annotation.objects.filter(image__image_set=imageset, deleted=False,
                                                 annotation_type=annotation_type).order_by('image')

        # TODO: Offset to settings
        context_offset = 0.15 if annotation_type.vector_type != AnnotationType.VECTOR_TYPE.GLOBAL else 0

        annotation_count = annotations.count()
        x_images = math.ceil(math.sqrt(annotation_count))
        y_images = math.ceil(math.sqrt(annotation_count))

        patch_width = int(annotation_type.default_width + annotation_type.default_width * context_offset)
        patch_height = int(annotation_type.default_height + annotation_type.default_height * context_offset)

        x_total_size = int(x_images * patch_width)
        y_total_size = int(y_images * patch_height)

        result_image = np.zeros(shape=(y_total_size, x_total_size, 3), dtype=np.uint8)

        ids = list(annotations.values_list('id', flat=True))

        name = '{0}_{1}.tiff'.format(annotation_type.product.name, annotation_type.name)
        result_image_names[name] = annotation_count

        new_image = imageset.images.filter(name=name,
                                           image_type=Image.ImageSourceTypes.SERVER_GENERATED).first()
        if new_image is None:
            new_image = Image(
                name = name,
                image_set = imageset,
                filename = name,
                image_type=Image.ImageSourceTypes.SERVER_GENERATED
            )
            new_image.save()

        slide = None
        last_path = None

        x_total_max = 0
        y_total_max = 0
        for x_row in range(x_images):
            x_start = x_total_max
            y_max = 0

            for y_row in range(y_images):
                if len(ids) == 0:
                    break
                id = ids.pop()
                anno = annotations.get(id=id)

                file_path = anno.image.path()
                if Path(file_path).exists() == False:
                    continue
                if file_path != last_path:
                    slide = openslide.open_slide(str(file_path))
                    last_path = file_path

                if annotation_type.vector_type != AnnotationType.VECTOR_TYPE.GLOBAL:
                    x_ori = anno.min_x
                    y_ori = anno.min_y
                    w_ori = anno.max_x - anno.min_x
                    h_ori = anno.max_y - anno.min_y
                else:
                    x_ori, y_ori, w_ori, h_ori = 0, 0, anno.image.width, anno.image.height

                # increase patch to context_offset
                x = int(max(0, x_ori - w_ori * context_offset))
                y = int(max(0, y_ori - h_ori * context_offset))
                w = int(w_ori + w_ori * context_offset)
                h = int(h_ori + h_ori * context_offset)
                if y + h > anno.image.height:
                    h = anno.image.height - y
                if x + w > anno.image.width:
                    w = anno.image.width - x

                scale_x = patch_width / w
                scale_y = patch_height / h
                if anno.vector is not None:
                    for i in range(1, (len(anno.vector) // 2) + 1):
                        #  bring to coordinate center
                        anno.vector['x' + str(i)] = anno.vector['x' + str(i)] - x_ori + ((w - w_ori) / 2)
                        anno.vector['y' + str(i)] = anno.vector['y' + str(i)] - y_ori + ((h - h_ori) / 2)

                        # scale
                        anno.vector['x' + str(i)] *= scale_x
                        anno.vector['y' + str(i)] *= scale_y

                patch = np.array(slide.read_region(location=(int(x), int(y)),
                                                   level=0, size=(w, h)))[:, :, :3]

                patch = cv2.resize(patch, (patch_width, patch_height))

                x_min = x_start
                x_max = x_min + patch.shape[1]
                x_total_max = x_max if x_max > x_total_max else x_total_max

                y_min = y_max
                y_max = y_min + patch.shape[0]
                y_total_max = y_max if y_max > y_total_max else y_total_max

                # create new image
                anno.image_id = new_image.id

                # move annotation to new location
                if anno.vector is not None:
                    for i in range(1, (len(anno.vector) // 2) + 1):
                        #  bring to coordinate center
                        anno.vector['x' + str(i)] = int(anno.vector['x' + str(i)] + x_min)
                        anno.vector['y' + str(i)] = int(anno.vector['y' + str(i)] + y_min)
                else:
                    anno.vector = {'x1': x_min, "y1": y_min, "x2": x_max, "y2": y_max}

                anno.id = None
                
                result_image[y_min:y_max, x_min:x_max] = patch
                anno.save()

        if annotation_count > 0:
            destination_path = os.path.join(settings.IMAGE_PATH, new_image.path())

            height, width, bands = result_image.shape
            linear = result_image.reshape(width * height * bands)

            vi = pyvips.Image.new_from_memory(linear.data, width, height, bands, 'uchar')
            vi.tiffsave(str(destination_path), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)

            new_image.width = x_total_size
            new_image.height = y_total_size
            new_image.save()

    return Response({
        'Names': result_image_names,
    }, status=HTTP_201_CREATED)


@api_view(['GET'])
@login_required
def sync_annotation_map(request, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    if not imageset.has_perm('edit_set', request.user):
        messages.warning(request,
                         _('You do not have permission to edit this imageset.'))
        return redirect(reverse('images:view_imageset', args=(imageset.id,)))

    # delete auto generated validations
    Verification.objects.filter(annotation__in=
                                Annotation.objects.filter(image__image_set=imageset,
                                                          image__image_type=Image.ImageSourceTypes.SERVER_GENERATED))\
        .delete()

    changed_annotations = {}
    for anno in Annotation.objects.filter(image__image_set=imageset, last_editor__isnull=False,
                                          image__image_type=Image.ImageSourceTypes.SERVER_GENERATED):

        for original_anno in Annotation.objects.filter(unique_identifier=anno.unique_identifier,
                                                       image__image_set=imageset) \
                .exclude(image__image_type=Image.ImageSourceTypes.SERVER_GENERATED) \
                .exclude(annotation_type=anno.annotation_type):

            if anno.annotation_type.id != original_anno.annotation_type.id:
                changed_annotations[original_anno.id] = "Id: {0} Original Type: {1} New Type: {2}"\
                    .format(original_anno.id, original_anno.annotation_type.name, anno.annotation_type.name)

                original_anno.last_editor = anno.last_editor
                original_anno.annotation_type = anno.annotation_type
                original_anno.save()

        anno.last_editor = None
        anno.save()


    return Response({
        "Updates" : changed_annotations
    }, status=HTTP_201_CREATED)



def parse_registration_points(registration_points_dict):
    source_points = []
    target_points = []

    for _, point_text in registration_points_dict.items():
        parts = dict(p.split(":") for p in point_text.split(","))
        x1 = float(parts['x1'])
        y1 = float(parts['y1'])
        x2 = float(parts['x2'])
        y2 = float(parts['y2'])
        target_points.append([x1, y1])
        source_points.append([x2, y2])

    return np.array(source_points), np.array(target_points)

def compute_scale_translation(source, target):
    """
    source: (2,2) array of source points
    target: (2,2) array of target points
    """
    # vector between points
    vec_src = source[1] - source[0]
    vec_tgt = target[1] - target[0]

    # compute the scaling factor
    dist_src = np.linalg.norm(vec_src)
    dist_tgt = np.linalg.norm(vec_tgt)

    scale = dist_tgt / dist_src

    # compute translation
    t_vec = target[0] - scale * source[0]

    return scale, t_vec

def predict_with_scale_translation(point, scale, t_vec):
    return scale * point + t_vec

def compute_affine_transform(source, target):
    # Solve affine transformation matrix: target = A * source + b
    n = source.shape[0]
    src_aug = np.hstack([source, np.ones((n, 1))])  # make (x, y, 1)
    A, _, _, _ = np.linalg.lstsq(src_aug, target, rcond=None)
    return A.T  # 2x3 matrix

def predict_with_affine(point, affine_matrix):
    augmented_point = np.append(point, 1)  # [x, y, 1]
    return np.dot(affine_matrix, augmented_point)

def extract_rotation_from_affine(affine_matrix):
    """
    Given a 2x3 affine matrix, extract the rotation angle in degrees.
    """
    a, b = affine_matrix[0, 0], affine_matrix[0, 1]
    c, d = affine_matrix[1, 0], affine_matrix[1, 1]

    # rotation in radians
    theta_rad = np.arctan2(b, a)

    # convert to degrees
    theta_deg = np.degrees(theta_rad)

    return theta_deg

def build_affine_from_scale_translation(scale, t_vec):
    """
    Create a 2x3 affine matrix from scale and translation vector.
    """
    affine_matrix = np.array([
        [scale, 0.0, t_vec[0]],
        [0.0, scale, t_vec[1]]
    ])
    return affine_matrix

@login_required
def image_snapshots(request, image_source, x_coord, y_coord, size_x,size_y):
    image_source_obj = get_object_or_404(Image, id=image_source)
#    source_image = getSlideHandler(image_source_obj.path())
    slide = image_cache.get(image_source_obj.path())._osr

    #tile = slide.get_tile(level, (col, row), frame=min(frame, image.frames-1))
 
    size_x = int(size_x)
    size_y = int(size_y)
    x_coord = int(x_coord)
    y_coord = int(y_coord)

    if not image_source_obj.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    tile = slide.read_region(location=(int(x_coord-size_x/2), int(y_coord-size_y/2)), level=0, size=(size_x, size_y))
    
    format='PNG'
    buf = PILBytesIO()
    tile.save(buf, format, quality=90)
    buffer = buf.getvalue()

    return HttpResponse(buffer, content_type='image/%s' % format)

@login_required
def manual_registration_view(request, registration_id):
    registration = get_object_or_404(ImageRegistration, id=registration_id)
    

    if not registration or len(registration.registration_points)==0:
        return HttpResponseBadRequest()
    
    if not registration.source_image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    if not registration.target_image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()
    
    image_source = registration.source_image
    image_target = registration.target_image
    error = registration.registration_error

    t = registration.transformation_matrix
    affine_matrix = np.array([[t["t_00"], t["t_01"], t["t_02"]], 
                        [t["t_10"], t["t_11"], t["t_12"]]])    
    
    source_pts, target_pts = parse_registration_points(json.loads(registration.registration_points))
    print('Source points:',source_pts)
    print('Target points:', target_pts)
    print('Projected: ',[predict_with_affine(s,affine_matrix) for s in source_pts])
    print('Rotation: ', extract_rotation_from_affine(affine_matrix))

    projected_points = [{'projected':[int(x) for x in predict_with_affine(s,affine_matrix)],
                            'error' : np.linalg.norm(predict_with_affine(s,affine_matrix) - t),
                            'source':[int(x) for x in s], 
                            'target':[int(x) for x in t]} for s,t in zip(source_pts,target_pts)]

    return render(request, 'images/registration_check.html', {
            'source': image_source.id,
            'target': image_target.id,
            'viewonly': True,
            'error':error,
            'rotation' : extract_rotation_from_affine(affine_matrix),
            'errornumstr':'%.2f' % error,
            'projected_points':projected_points,
            'affine_matrix': json.dumps(affine_matrix.tolist()),
            'registration_points' : registration.registration_points,
        }) 

@login_required
def manual_registration(request, image_source, image_target):
    print(image_source, image_target)
    print(request.POST)
    offset=''
    error=0
    fourpoints_ok=0
    save_possible=False
    affine_matrix=np.array([])
    rotation=0
    warn_existing=0
    image_source_obj = get_object_or_404(Image, id=image_source)
    image_target_obj = get_object_or_404(Image, id=image_target)

    registration_points_raw = request.POST.get('registration_points', '{}')
    print('regis raw:',registration_points_raw)
        
        # Safely parse the string into a Python dictionary
    try:
        registration_points = ast.literal_eval(registration_points_raw)
    except Exception as e:
        registration_points = {}
        print("Failed to parse registration points:", e)
        
    if request.POST.get('step') and int(request.POST.get('step'))>0:
        step=int(request.POST.get('step'))
    else:
        step=0
        existing=ImageRegistration.objects.filter(source_image=image_source_obj).filter(target_image=image_target_obj).first()
        if existing:
            if (request.POST.get('delete_current')):
                warn_existing = 0
                existing.delete()

            else:
                warn_existing = 1

    if (request.POST.get('source_x') and request.POST.get('source_y') and 
       request.POST.get('target_x') and request.POST.get('target_y')):
       tuple_registration = f'x1:{float(request.POST.get("source_x"))},y1:{float(request.POST.get("source_y"))},x2:{float(request.POST.get("target_x"))},y2:{float(request.POST.get("target_y"))}'
       registration_points[step] = tuple_registration

    if (request.POST.get('action','')=='store'):
        affine_matrix = request.POST.get('affine_matrix', '[]')

        affine_matrix=json.loads(affine_matrix)
        M = np.array(affine_matrix)
        print('Shape of M:',M.shape)
        matrix_exactformat =  {
            "t_00": M [0,0], 
            "t_01": M [0,1],
            "t_02": M [0,2], 

            "t_10": M [1,0],  
            "t_11": M [1,1],
            "t_12": M [1,2],  

            "t_20": 0,              
            "t_21": 0,     
            "t_22": 1, 
        }        
        reg = ImageRegistration(transformation_matrix=matrix_exactformat, source_image=image_source_obj, target_image=image_target_obj, registration_error=request.POST.get("est_error",0), registration_points=json.dumps(registration_points))
        reg.save()

        return redirect(reverse('images:view_imageset', args=(image_source_obj.image_set.id,)))


    # if 2 points or more are given, try a first registration
    source_pts, target_pts = parse_registration_points(registration_points)

    if len(source_pts) >= 2:
        # Compute rigid transform
        scale, t_vec = compute_scale_translation(source_pts[:2], target_pts[:2])
        print(f"Scale: {scale}")
        print(f"Translation vector: {t_vec}")

    if len(source_pts) >= 3:
            src_third = source_pts[2]
            true_third = target_pts[2]
            pred_third = predict_with_scale_translation(src_third, scale, t_vec)
            affine_matrix = build_affine_from_scale_translation(scale=scale, t_vec=t_vec)
            error = np.linalg.norm(pred_third - true_third)
            print(f"Error at 3rd point: {error:.2f}")

            threshold = 25.0  # you can tune this!
            if error > threshold:
                print("Scale+Translation not sufficient, switching to Affine transform...")
                affine_matrix = compute_affine_transform(source_pts, target_pts)
                print("Affine Transform Matrix:")
                print(affine_matrix)
                rotation=extract_rotation_from_affine(affine_matrix)   
                rotation=f'rotation estimate: {rotation:.2f} °' 
            offset=f'offset: {str(pred_third - true_third)} px'

             
    if len(source_pts) >= 4:
            affine_matrix = compute_affine_transform(source_pts, target_pts)
            print("Affine Transform Matrix:")
            print(affine_matrix)

            # Now predict 4th point
            src_fourth = source_pts[3]
            true_fourth = target_pts[3]
            pred_fourth = predict_with_affine(src_fourth, affine_matrix)

            projected_points = [{'projected':[int(x) for x in predict_with_affine(s,affine_matrix)],
                                 'error' : np.linalg.norm(predict_with_affine(s,affine_matrix) - t),
                                 'source':[int(x) for x in s], 
                                 'target':[int(x) for x in t]} for s,t in zip(source_pts,target_pts)]

            error = np.linalg.norm(pred_fourth - true_fourth)
            print(f"Affine Error on 4th point: {error:.2f}")
            fourpoints_ok=1

            if error > threshold:
                print("Warning: even affine error is high!")
                fourpoints_ok=0

    if len(source_pts) == 4:
        return render(request, 'images/registration_check.html', {
            'source': image_source,
            'target': image_target,
            'viewonly': False,
            'warn_existing':warn_existing,
            'offset':offset,
            'error':error,
            'rotation' : extract_rotation_from_affine(affine_matrix),
            'errornumstr':'%.2f' % error,
            'save':save_possible,
            'fourpoints_ok':fourpoints_ok,
            'projected_points':projected_points,
            'affine_matrix': json.dumps(affine_matrix.tolist()),
            'registration_points' : registration_points,
        }) 
    step=step+1

    print('points:',registration_points)
    return render(request, 'images/register_manually.html', {
            'source': image_source,
            'target': image_target,
            'step':step,
            'step1':step>0,
            'step2':step>1,
            'step3':step>2,
            'step4':step>3,
            'step5':step>4,
            'warn_existing':warn_existing,
            'offset':offset,
            'error':error,
            'errornumstr':'%.2f' % error,
            'save':save_possible,
            'fourpoints_ok':fourpoints_ok,
            'rotation': rotation,
            'affine_matrix': json.dumps(affine_matrix.tolist()),
            'registration_points' : registration_points,
        })    

@login_required
def edit_imageset(request, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    if not imageset.has_perm('edit_set', request.user):
        messages.warning(request,
                         _('You do not have permission to edit this imageset.'))
        return redirect(reverse('images:view_imageset', args=(imageset.id,)))

    form = ImageSetEditForm(instance=imageset)

    if request.method == 'POST':
        form = ImageSetEditForm(request.POST, instance=imageset)
        if form.is_valid():
            form.save()
            # TODO: check if name and path are unique in the team
            return redirect(reverse('images:view_imageset',
                                    args=(imageset.id,)))

    return render(request, 'images/edit_imageset.html', {
        'form': form,
    })


@login_required
def delete_imageset(request, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    if not imageset.has_perm('delete_set', request.user):
        messages.warning(request,
                         _('You do not have permission to delete this imageset.'))
        return redirect(reverse('images:imageset', args=(imageset.pk,)))

    if request.method == 'POST':
        try:
            shutil.rmtree(imageset.root_path())
        except:
            print(f"imageset {imageset.name} allready deleted")
        imageset.delete()
        return redirect(reverse('users:team', args=(imageset.team.id,)))

    return render(request, 'images/delete_imageset.html', {
        'imageset': imageset,
    })


@login_required
def set_free(request, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    if not imageset.images:
        messages.warning(request,
                         _('You can not release an empty imageset'))
        return redirect(reverse('images:imageset', args=(imageset.pk,)))
    if not imageset.has_perm('delete_set', request.user):
        messages.warning(request,
                         _('You do not have permission to release this imageset'))
        return redirect(reverse('images:imageset', args=(imageset.pk,)))

    if request.method == 'POST':
        imageset.public = True
        imageset.public_collaboration = True
        imageset.team = None
        imageset.image_lock = True
        imageset.save()
        return redirect(reverse('images:view_imageset', args=(imageset_id,)))
    return render(request, 'images/setfree_imageset.html', {
        'imageset': imageset,
    })


@login_required
def toggle_pin_imageset(request, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    if 'read' in imageset.get_perms(request.user):
        if request.user in imageset.pinned_by.all():
            imageset.pinned_by.remove(request.user)
            imageset.save()
            messages.info(request, 'Removed \"{}\" from your pinned imagesets'
                          .format(imageset.name))
        else:
            imageset.pinned_by.add(request.user)
            imageset.save()
            messages.info(request, 'Added \"{}\" to your pinned imagesets'
                          .format(imageset.name))

    return redirect(reverse('images:view_imageset', args=(imageset_id,)))


def sanitize_filename(filename):
    """
    Sanitize a filename to make it valid by replacing invalid characters with an underscore.
    
    Parameters:
    filename (str): The filename to sanitize.

    Returns:
    str: A valid filename.
    """
    # Define a regex pattern for invalid characters
    invalid_chars = r'[<>:"/\\|?*]'
    
    # Replace invalid characters with an underscore
    sanitized_name = re.sub(invalid_chars, '_', filename)
    
    # Ensure the filename is not empty after sanitization
    if not sanitized_name:
        sanitized_name = 'default_filename.tiff'
    
    # Truncate the filename to 255 characters if it's too long
    if len(sanitized_name) > 255:
        sanitized_name = sanitized_name[:255]
    
    return sanitized_name

@authentication_classes([BasicAuthentication])
@permission_classes([IsAuthenticated])
@api_view(['GET'])
def crop_from_image(request, image_id,x,y,z, w,h, target_imageset_id):
    image = get_object_or_404(Image, id=image_id)
    imageset = get_object_or_404(ImageSet, id=target_imageset_id)


    if 'edit_set' not in imageset.get_perms(request.user):
         return HttpResponse(status=HTTP_403_FORBIDDEN)

    if 'edit_set' not in image.image_set.get_perms(request.user):
         return HttpResponse(status=HTTP_403_FORBIDDEN)


    try:
        x = int(x)
        y = int(y)
        z = int(z)
        w = int(w)
        h = int(h)
    except:
        return HttpResponse(status=HTTP_403_FORBIDDEN)

    sl = getSlideHandler(image.path())
    img = sl.read_region(location=(x,y), level=0, size=(w,h), frame=z)
    vi = pyvips.Image.new_from_array(np.array(img))

    path = Path(str(Path(image.path()).with_suffix('').name)+f'x{x}_y{y}_z{z}_w{w}_h{h}.tiff')

    path = imageset.root_path() / path

    if vi.bands == 4:
        vi = vi[:3]  # drop alpha channel

    res = 1000 / image.mpp

#    print('MPP was:',image.mpp)
    vi.tiffsave(str(path), tile=True, xres=res, yres=res, resunit='inch', compression='jpeg', Q=90, bigtiff=True, pyramid=True, tile_width=256, tile_height=256, properties=True)
    fchecksum = hashlib.sha512()
    with open(str(path), 'rb') as fil:
        buf = fil.read(10000)
        fchecksum.update(buf)
    fchecksum = fchecksum.digest()

    newimage = Image(
        name=path.name,
        filename=path.name,
        width=w,
        height=h,
        mpp=image.mpp,
        objectivePower=image.objectivePower,
        image_set=imageset,
        checksum=fchecksum)
    
    newimage.save()

    return Response(ImageSerializer(newimage).data, status=HTTP_201_CREATED)
#    image.save_file(file_path)






@login_required
def rename_image(request, imageset_id):
    fileID = request.POST.get('fileID')
    image = get_object_or_404(Image, id=fileID)
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    newName = sanitize_filename(request.POST.get('newName',''))
    if len(newName)<4:
        return redirect(reverse('images:view_imageset', args=(imageset_id,)))
    imagestem,imageext = os.path.splitext(image.name)
    newstem,newext = os.path.splitext(newName)
    filenamestem, filenameext = os.path.splitext(image.filename)
    if not (newext.upper() ==imageext.upper()):
        return redirect(reverse('images:view_imageset', args=(imageset_id,)))


    if 'edit_set' in imageset.get_perms(request.user):
        if os.path.exists(os.path.join(imageset.root_path(),image.name)):
            os.rename(os.path.join(imageset.root_path(),image.name),
                    os.path.join(imageset.root_path(),newName))
        if (image.filename != image.name):
            # also rename image.name, if exists
            if os.path.exists(os.path.join(imageset.root_path(),image.filename)):
                os.rename(os.path.join(imageset.root_path(),image.filename),
                          os.path.join(imageset.root_path(),newstem+filenameext))

        if (imageext.upper()=='.MRXS') and os.path.exists(os.path.join(imageset.root_path(),imagestem)):
            # for MRXS we need to also rename the directory
            os.rename(os.path.join(imageset.root_path(),imagestem),
                    os.path.join(imageset.root_path(),newstem))

        # rename thumbnail if exists (should always, but who knows ;-) )
        if (os.path.exists(image.thumbnail_path())):
            os.rename(image.thumbnail_path(),
                      os.path.join(imageset.root_path(),newstem+image.thumbnail_extension))

        # filename and name might have a different extension
        image.filename = newstem+filenameext
        image.name = newName
        image.save()
    else:
        print('Permission not found for user',request.user)

    return redirect(reverse('images:view_imageset', args=(imageset_id,)))

@login_required
def copy_image(request, image_id, imageset_id):
    image = get_object_or_404(Image, id=image_id)
    target_imageset = get_object_or_404(ImageSet, id=imageset_id)

    try:
        copy_annotations = 'copy_annotations' in request.POST.keys()
    except (KeyError, TypeError, ValueError):
        raise ParseError

    new_image = target_imageset.images.filter(name=image.name).first()
    if new_image is None:
        # use symbolic link

        if os.path.exists(target_imageset.root_path() + "/" + image.filename) ==  False:
            os.symlink(image.path(), target_imageset.root_path() + "/" + image.filename)

        image_original_id = image.id
        image.id = None
        image.image_set = target_imageset
        image.save()

        if copy_annotations:
            for anno in Annotation.objects.filter(image__id=image_original_id, deleted=False,
                                                          annotation_type__active=True):

                api_copy_annotation(request, anno.id, image.id)
    elif(copy_annotations):
        for anno in Annotation.objects.filter(image__id=new_image.id, deleted=False,
                                              annotation_type__active=True):
            api_copy_annotation(request, anno.id, image.id)

    return Response({
        "Image": ImageSerializer(image).data
    }, status=HTTP_201_CREATED)


@login_required
def copy_images_to_imageset(request, imageset_id):
    target_imageset = get_object_or_404(ImageSet, id=imageset_id)
    if not target_imageset.has_perm('edit_set', request.user):
        messages.warning(request,
                         _('You do not have permission to edit this imageset.'))
        return redirect(reverse('images:view_imageset', args=(target_imageset.id,)))

    if request.method == 'POST':
        ids = request.POST.getlist('imagesets')

        for image in Image.objects.filter(image_set_id__in=ids)\
                .exclude(image_type=Image.ImageSourceTypes.SERVER_GENERATED):
            copy_image(request, image.id, imageset_id)


    return redirect(reverse('images:view_imageset', args=(imageset_id,)))



@login_required
def label_upload(request, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    if not imageset.has_perm('annotate', request.user):
        messages.warning(request,
                         _('You do not have permission to upload the annotations to this set.'))
        return redirect(reverse('images:view_imageset', args=(imageset_id,)))

    images = Image.objects.filter(image_set=imageset)
    report_list = list()
    if request.method == 'POST':
        error_count = 0
        similar_count = 0
        verify = 'verify' in request.POST.keys()
        for line in request.FILES['file']:
            # filter empty lines
            if line in ('', "b'\n'"):
                continue
            dec_line = line.decode().replace('\r', '').replace('\n', '').replace(',}', '}')
            line_frags = dec_line.split('|')
            image = images.filter(name=line_frags[0])
            if image.exists():
                image = image[0]
                annotation_type = AnnotationType.objects.filter(name=line_frags[1], active=True,
                                                                product__in=imageset.product_set.all())
                if annotation_type.exists():
                    annotation_type = annotation_type[0]
                    vector = False
                    blurred = False
                    concealed = False
                    if len(line_frags) > 3:
                        flags = line_frags[3]
                        test_flags = flags.replace('b', '')
                        test_flags = test_flags.replace('c', '')
                        if len(test_flags) > 0:
                            report_list.append(
                                'unknown flags: \"{}\" for image: \"{}\"'
                                .format(test_flags, line_frags[0])
                            )
                        blurred = 'b' in flags
                        concealed = 'c' in flags
                    if line_frags[2] == 'not in image' or line_frags[2] == '{}':
                        vector = None

                    else:
                        try:
                            vector = json.loads(line_frags[2])
                        except JSONDecodeError:
                            report_list.append("In image \"{}\" the annotation:"
                                               " \"{}\" was not accepted as valid JSON".format(line_frags[0], line_frags[2]))

                    unique_identifier = None
                    if len(line_frags) > 4:
                        unique_identifier = line_frags[4]

                    if annotation_type.validate_vector(vector):
                        #if not Annotation.similar_annotations(vector, image, annotation_type):
                        if not Annotation.equal_annotation(vector, image, annotation_type, request.user):
                            annotation = Annotation()
                            annotation.annotation_type = annotation_type
                            annotation.image = image
                            annotation.user = request.user
                            annotation.last_editor = request.user
                            annotation.vector = vector
                            annotation._blurred = blurred
                            annotation._concealed = concealed
                            annotation.save()                            

                            if unique_identifier is not None:
                                annotation.unique_identifier = unique_identifier
                                annotation.save()        

                            if verify:
                                verification = Verification()
                                verification.user = request.user
                                verification.annotation = annotation
                                verification.verified = verify
                                verification.save()
                        else:
                            similar_count += 1
                            report_list.append(
                                'For the image ' + line_frags[0] + ' the annotation ' +
                                line_frags[2] + ' was too similar to an already existing one')
                    else:
                        error_count += 1
                        report_list.append(
                            'For the image ' + line_frags[0] + ' the annotation ' +
                            line_frags[2] + ' was not a valid vector or '
                            'bounding box for the annotation type'
                        )
                else:
                    error_count += 1
                    report_list.append(
                        'For the image ' + line_frags[0] + ' the annotation type \"' +
                        line_frags[1] + '\" does not exist in this exact')
            else:
                error_count += 1
                report_list.append('The image \"' + line_frags[0] + '\" does not exist in this imageset')

        for element in report_list[:20]:
            messages.error(request, element)
            if len(report_list) > 20:
                messages.warning(request, 'Only the first 20 errors are displayed.')
        if error_count + similar_count > 0:
            messages.warning(
                request,
                _('The label upload ended with {} errors and {} similar existing labels.')
                .format(error_count, similar_count))
        else:
            messages.success(
                request,
                _('The label upload ended with {} errors and {} similar existing labels.')
                .format(error_count, similar_count))
    return redirect(reverse('images:view_imageset', args=(imageset_id,)))


def dl_script(request):
    return TemplateResponse(request, 'images/download.py', context={
                            'base_url': settings.DOWNLOAD_BASE_URL,
                            }, content_type='text/plain')


def download_imageset_zip(request, image_set_id):
    """
    Get a zip archive containing the images of the imageset with id image_set_id.
    If the zip file generation is still in progress, a HTTP status 202 (ACCEPTED) is returned.
    For empty image sets, status 204 (NO CONTENT) is returned instead of an empty zip file.
    """
    image_set = get_object_or_404(ImageSet, id=image_set_id)

    if not settings.ENABLE_ZIP_DOWNLOAD:
        return HttpResponse(status=HTTP_404_NOT_FOUND)

    if not image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    if image_set.image_count == 0:
        # It should not be possible to download empty image sets. This
        # is already blocked in the UI, but it should also be checked
        # on the server side.
        return HttpResponse(status=HTTP_204_NO_CONTENT)

    if image_set.zip_state != ImageSet.ZipState.READY:
        return HttpResponse(content=b'Imageset is currently processed', status=HTTP_202_ACCEPTED)

    file_path = os.path.join(settings.IMAGE_PATH, image_set.zip_path())

    if settings.USE_NGINX_IMAGE_PROVISION:
        response = HttpResponse(content_type='application/zip')
        response['X-Accel-Redirect'] = "/ngx_static_dn/{0}".format(image_set.zip_path())
    else:
        response = FileResponse(open(file_path, 'rb'), content_type='application/zip')

    response['Content-Length'] = os.path.getsize(file_path)
    response['Content-Disposition'] = "attachment; filename={}".format(image_set.zip_name())
    return response



@login_required
@api_view(['POST'])
def api_verify_image(request) -> Response:
    try:
        image_id = int(request.data['image_id'])
        if request.data['state'] == 'accept':
            state = True
        elif request.data['state'] == 'reject':
            state = False
        else:
            raise ParseError

    except (KeyError, TypeError, ValueError):
        raise ParseError

    image = get_object_or_404(Image, pk=image_id)

    if not image.image_set.has_perm('verify', request.user):
        return Response({
            'detail': 'permission for verifying annotations in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    for annotation in image.annotations.filter(Q(verifications__verified=not state, verifications__user=request.user)
                                               | Q(verifications=None)):
        annotation.verify(request.user, state)

    return Response({
        'state': request.data['state'],
    }, status=HTTP_200_OK)

@api_view(['GET'])
def load_image_set(request) -> Response:
    try:
        image_set_id = int(request.query_params['image_set_id'])
        filter_annotation_type_id = request.query_params.get('filter_annotation_type_id', None)

    except (KeyError, TypeError, ValueError):
        raise ParseError

    image_set = get_object_or_404(ImageSet, pk=image_set_id)

    if not image_set.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    #serializer = ImageSetSerializer(image_set)
    serialized_image_set = serialize_imageset(image_set)
    if filter_annotation_type_id is not None and filter_annotation_type_id.isdigit():
        # TODO: find a cleaner solution to filter related field set wihtin ImageSet serializer
        serialized_image_set['images'] = ImageSerializer(
            image_set.images.filter(
                annotations__deleted=False, annotations__annotation_type__active=True,
                annotations__annotation_type__id=int(filter_annotation_type_id)).distinct().order_by(
                'name'), many=True).data
    elif type(filter_annotation_type_id) is str:
        if filter_annotation_type_id == "Unverified":
            ids = image_set.get_unverified_ids(request.user)
            serialized_image_set['images'] = ImageSerializer(
                image_set.images.filter(id__in=ids).order_by(
                'name'), many=True).data
        elif filter_annotation_type_id == "Verified":
            ids = image_set.get_verified_ids(request.user)
            serialized_image_set['images'] = ImageSerializer(
                image_set.images.filter(id__in=ids).order_by(
                'name'), many=True).data
        elif filter_annotation_type_id == "NoAnnotations":
            serialized_image_set['images'] = ImageSerializer(
                image_set.images.annotate(anno_count=Count('annotations')).filter(anno_count=0).order_by(
                    'name'), many=True).data
        elif filter_annotation_type_id == "ComputerGenerated":
            serialized_image_set['images'] = ImageSerializer(
                image_set.images.filter(image_type=Image.ImageSourceTypes.SERVER_GENERATED).order_by(
                    'name'), many=True).data
        else:
            serialized_image_set['images'] = ImageSerializer(
                image_set.images.order_by('name'), many=True).data


    else:
        # TODO: find a cleaner solution to order related field set wihtin ImageSet serializer
        serialized_image_set['images'] = ImageSerializer(
            image_set.images.order_by('name'), many=True).data

    return Response({
        'image_set': serialized_image_set,
    }, status=HTTP_200_OK)

@api_view(['POST'])
def product_image_set(request) -> Response:
    try:
        image_set_id = int(request.data['image_set_id'])
        product_id = int(request.data['product_id'])
    except (KeyError, TypeError, ValueError):
        raise ParseError
    image_set = get_object_or_404(ImageSet, pk=image_set_id)

    if not image_set.has_perm('edit_set', request.user):
        return Response({
            'detail': 'permission for adding a product to this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if image_set.product_set.filter(id=product_id).exists():
        return Response({
            'detail': 'imageset has the product already.',
        }, status=HTTP_200_OK)

    product = Product.objects.filter(id=product_id).first()
    product.imagesets.add(image_set)
    product.save()

    serializer = ProductSerializer(product)

    return Response({
        'detail': 'added a product to the imageset.',
        'product': serializer.data,
    }, status=HTTP_201_CREATED)

@login_required
@api_view(['DELETE'])
def remove_image_set_product(request) -> Response:
    try:
        image_set_id = int(request.data['image_set_id'])
        product_id = int(request.data['product_id'])
    except (KeyError, TypeError, ValueError):
        raise ParseError
    image_set = get_object_or_404(ImageSet, pk=image_set_id)
    product = get_object_or_404(Product, id=product_id)

    if not image_set.has_perm('edit_set', request.user):
        return Response({
            'detail': 'permission for removing products for this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if product not in image_set.product_set.all():
        return Response({
            'detail': 'product not in imageset tags',
        }, status=HTTP_200_OK)

    product.imagesets.remove(image_set)

    serializer = ProductSerializer(product)
    serializer_data = serializer.data

    product.save()

    return Response({
        'detail': 'removed the product.',
        'product': serializer_data,
    }, status=HTTP_201_CREATED)


@login_required
@api_view(['POST'])
def tag_image_set(request) -> Response:
    try:
        image_set_id = int(request.data['image_set_id'])
        tag_name = str(request.data['tag_name']).lower()
    except (KeyError, TypeError, ValueError):
        raise ParseError
    image_set = get_object_or_404(ImageSet, pk=image_set_id)
    char_blacklist = [',', '&', '=', '?']
    for char in char_blacklist:
        tag_name = tag_name.replace(char, '')
    tag_name = tag_name.replace(' ', '_')

    if not image_set.has_perm('edit_set', request.user):
        return Response({
            'detail': 'permission for tagging this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if image_set.set_tags.filter(name=tag_name).exists():
        return Response({
            'detail': 'imageset has the tag already.',
        }, status=HTTP_200_OK)

    # TODO: validate the name?
    # TODO: this in better?
    if SetTag.objects.filter(name=tag_name).exists():
        tag = SetTag.objects.get(name=tag_name)
    else:
        tag = SetTag(name=tag_name)
        # TODO this in better?
        tag.save()
    tag.imagesets.add(image_set)
    tag.save()

    serializer = SetTagSerializer(tag)

    return Response({
        'detail': 'tagged the imageset.',
        'tag': serializer.data,
    }, status=HTTP_201_CREATED)


@login_required
@api_view(['DELETE'])
def remove_image_set_tag(request) -> Response:
    try:
        image_set_id = int(request.data['image_set_id'])
        tag_name = str(request.data['tag_name']).lower()
    except (KeyError, TypeError, ValueError):
        raise ParseError
    image_set = get_object_or_404(ImageSet, pk=image_set_id)
    tag = get_object_or_404(SetTag, name=tag_name)

    if not image_set.has_perm('edit_set', request.user):
        return Response({
            'detail': 'permission for tagging this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if tag not in image_set.set_tags.all():
        return Response({
            'detail': 'tag not in imageset tags',
        }, status=HTTP_200_OK)
    tag.imagesets.remove(image_set)
    serializer = SetTagSerializer(tag)
    serializer_data = serializer.data
    if not tag.imagesets.exists() and tag.name != 'test':
        tag.delete()
    else:
        tag.save()

    return Response({
        'detail': 'removed the tag.',
        'tag': serializer_data,
    }, status=HTTP_201_CREATED)


@login_required
@api_view(['GET'])
def autocomplete_image_set_tag(request) -> Response:
    try:
        tag_name_query = str(request.GET['query']).lower()
    except (KeyError, TypeError, ValueError):
        raise ParseError
    tag_suggestions = list(SetTag.objects.filter(name__startswith=tag_name_query))
    tag_suggestions.extend(list(SetTag.objects.filter(~Q(name__startswith=tag_name_query) & Q(name__contains=tag_name_query))))
    tag_suggestions = [tag_suggestion.name for tag_suggestion in tag_suggestions]
    print(tag_suggestions)

    return Response({
        'query': tag_name_query,
        'suggestions': tag_suggestions,
    }, status=HTTP_200_OK)
