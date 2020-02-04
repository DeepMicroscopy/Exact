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
    FileResponse, HttpRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.template.response import TemplateResponse
from django.utils.translation import ugettext_lazy as _
from django.core.cache import cache
from json import JSONDecodeError
from rest_framework.decorators import api_view
from rest_framework.exceptions import ParseError
from rest_framework.response import Response
from rest_framework.status import HTTP_403_FORBIDDEN, HTTP_200_OK, \
    HTTP_201_CREATED, HTTP_202_ACCEPTED, HTTP_204_NO_CONTENT, HTTP_404_NOT_FOUND
from PIL import Image as PIL_Image

from exact.images.serializers import ImageSetSerializer, ImageSerializer, SetTagSerializer, serialize_imageset
from exact.images.forms import ImageSetCreationForm, ImageSetCreationFormWT, ImageSetEditForm
from exact.annotations.views import api_copy_annotation
from exact.users.forms import TeamCreationForm
from exact.users.models import User, Team
from exact.tagger_messages.forms import TeamMessageCreationForm
from exact.administration.models import Product
from exact.administration.serializers import ProductSerializer

from .models import ImageSet, Image, SetTag
from .forms import LabelUploadForm, CopyImageSetForm
from exact.annotations.models import Annotation, Export, ExportFormat, \
    AnnotationType, Verification, LogImageAction
from exact.tagger_messages.models import Message, TeamMessage, GlobalMessage
from util.slide_server import SlideCache, SlideFile, PILBytesIO


from plugins.pluginFinder import PluginFinder
from plugins.ExactServerPlugin import UpdatePolicy, ViewPolicy, NavigationViewOverlayStatus

import platform
import os
import shutil
from shutil import which
import string
import random
import zipfile
import hashlib
import json
import imghdr
from datetime import date, timedelta, datetime
from pathlib import Path
import re
import math
import numpy as np
from multiprocessing.pool import ThreadPool
import subprocess
import cv2
from tifffile import *
import openslide
from openslide import OpenSlide, open_slide
from PIL import Image as PIL_Image

# TODO: Add to cache
image_cache = SlideCache(cache_size=10)
plugin_finder = PluginFinder(image_cache)


@login_required
def explore_imageset(request):
    imagesets = ImageSet.objects.select_related('team').order_by(
        'team__name', 'name').filter(
        Q(team__members=request.user) | Q(public=True)).distinct()

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

    paginator = Paginator(imagesets, 25)
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


@api_view(['GET'])
def api_index(request:HttpRequest):

    if not request.user.is_authenticated:
        return Response({},HTTP_403_FORBIDDEN)
    userteams = Team.objects.filter(members=request.user)

    imagesets = ImageSet.objects.filter(team__in=userteams).annotate(
        image_count_agg=Count('images')
    ).select_related('team').prefetch_related('set_tags') \
        .order_by('-priority', '-time')

    retarr = []
    for imageset in imagesets:
        retarr.append(serialize_imageset(imageset))
    
    return Response(retarr, HTTP_200_OK)
    


@login_required
def index(request):
    team_creation_form = TeamCreationForm()

    # needed to show the list of the users imagesets
    userteams = Team.objects.filter(members=request.user)
    # get all teams where the user is an admin
    user_admin_teams = Team.objects.filter(memberships__user=request.user, memberships__is_admin=True)
    imagesets = ImageSet.objects.filter(team__in=userteams).annotate(
        image_count_agg=Count('images')
    ).select_related('team').prefetch_related('set_tags') \
        .order_by('-priority', '-time')

    imageset_creation_form = ImageSetCreationFormWT()  # the user provides the team manually
    imageset_creation_form.fields['team'].queryset = userteams
    annotation_types = Annotation.objects.values('annotation_type').annotate(
        annotation_count=Count('pk'),
        public_annotation_count=Count('pk', filter=Q(image__image_set__public=True)),
        name=F('annotation_type__name'))

    image_stats = Image.objects.aggregate(
        total_count=Count('pk'),
        public_count=Count('pk', filter=Q(image_set__public=True)))
    imageset_stats = ImageSet.objects.aggregate(
        total_count=Count('pk'),
        public_count=Count('pk', filter=Q(public=True)))
    user_stats = User.objects.aggregate(
        total_count=Count('pk'),
        active_count=Count('pk', filter=Q(points__gte=50)))
    team_stats = Team.objects.aggregate(
        total_count=Count('pk'),
        active_count=Count('pk', filter=Q(
            pk__in=Team.objects.filter(
                memberships__user__in=User.objects.filter(
                    points__gte=50)))))

    stats = {
        'all_images': image_stats.get('total_count', 0) or 0,
        'public_images': image_stats.get('public_count', 0) or 0,
        'all_imagesets': imageset_stats.get('total_count', 0) or 0,
        'public_imagesets': imageset_stats.get('public_count', 0) or 0,
        'all_users': user_stats.get('total_count', 0) or 0,
        'active_users': user_stats.get('active_count', 0) or 0,
        'all_teams': team_stats.get('total_count', 0) or 0,
        'active_teams': team_stats.get('active_count', 0) or 0,
        'annotation_types': annotation_types[:3],
    }

    global_annoucements = Message.in_range(GlobalMessage.get(request.user).filter(~Q(read_by=request.user)))

    # Inits message creation form
    team_message_creation_form = TeamMessageCreationForm(
        initial={
            'start_time': str(date.today()),
            'expire_time': str(date.today() + timedelta(days=settings.DEFAULT_EXPIRE_TIME)),
        })

    team_message_creation_form.fields['team'].queryset = user_admin_teams

    # Gets all unread messages
    usermessages = Message.in_range(TeamMessage.get_messages_for_user(request.user)).filter(~Q(read_by=request.user))

    too_many_massages = False

    front_page_messages = 5

    if usermessages.count() > front_page_messages:
        usermessages = usermessages[:front_page_messages]
        too_many_massages = True

    many_annoucements = False
    if global_annoucements.count() > 5:
        many_annoucements = True

    last_image_action = LogImageAction.objects.filter(user=request.user).order_by('-time').first()

    return TemplateResponse(request, 'images/index.html', {
        'last_image_action': last_image_action,
        'user': request.user,
        'team_creation_form': team_creation_form,
        'imageset_creation_form': imageset_creation_form,
        'team_message_creation_form': team_message_creation_form,
        'image_sets': imagesets.order_by('team', 'priority' ,'name'),
        'user_has_admin_teams': user_admin_teams.exists(),
        'userteams': userteams,
        'stats': stats,
        'usermessages': usermessages,
        'too_many_messages': too_many_massages,
        'many_annoucements': many_annoucements,
        'global_annoucements': global_annoucements,
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
        for f in request.FILES.getlist('files[]'):
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
                filenames = [f for f in os.listdir(os.path.join(imageset.root_path()))]
                filenames.sort()
                duplicat_count = 0
                for filename in filenames:

                    file_path = os.path.join(imageset.root_path(), filename)
                    if Image.objects.filter(Q(filename=filename)|Q(name=filename),
                                            image_set=imageset).count() == 0:

                        try:
                            if open_slide(file_path):
                                # creates a checksum for image
                                fchecksum = hashlib.sha512()
                                with open(file_path, 'rb') as fil:
                                    while True:
                                        buf = fil.read(10000)
                                        if not buf:
                                            break
                                        fchecksum.update(buf)
                                fchecksum = fchecksum.digest()

                                file_list[file_path] = fchecksum
                            else:
                                error['unsupported'] = True

                        except IsADirectoryError:
                            error['directories'] = True
                        except:
                            error['unsupported'] = True
                    else:
                        os.remove(file_path)

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
                if Image.objects.filter(Q(filename=filename)|Q(name=filename), checksum=fchecksum,
                                        image_set=imageset)\
                        .count() == 0:

                    with open(filename, 'wb') as out:
                        for chunk in f.chunks():
                            out.write(chunk)

                    file_list[filename] = fchecksum
                else:
                    os.remove(filename)

            for path in file_list:

                try:

                    fchecksum = file_list[path]

                    path = Path(path)
                    name = path.name
                    # check if the file can be opened by OpenSlide if not convert it
                    try:
                        osr = OpenSlide(str(path))
                    except:
                        old_path = path
                        path = Path(path).with_suffix('.tiff')
                        # TODO: Time intensive decrease priority

                        if (which('convert') == None):
                            error['convert'] = True

                        if (platform.system() == "Linux"):
                            os.system(
                                'nice -n 19 convert "{0}" -define tiff:tile-geometry=254x254 ptif:"{1}"'.format(
                                    old_path, path))
                        elif (platform.system() == "Windows"):
                            os.system('convert "{0}" -define tiff:tile-geometry=254x254 ptif:"{1}"'.format(
                                    old_path, path))
                        else:
                            os.system('convert "{0}" -define tiff:tile-geometry=254x254 ptif:"{1}"'.format(
                                    old_path, path))



                    #shutil.chown(str(path), group=settings.UPLOAD_FS_GROUP)

                    image = Image(
                        name=name,
                        image_set=imageset,
                        filename=path.name,
                        checksum=fchecksum)


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
                except:
                    error['unsupported'] = True
                    os.remove(str(path))

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
                                   'id' : image.id,
                                   # 'url': reverse('images_imageview', args=(image.id, )),
                                   # 'thumbnailUrl': reverse('images_imageview', args=(image.id, )),
                                   # 'deleteUrl': reverse('images_imagedeleteview', args=(image.id, )),
                                   # 'deleteType': "DELETE",
                                   })
            else:
                json_files.append({'name': f.name,
                                   'size': f.size,
                                   'error': errormessage,
                                   })

        return JsonResponse({'files': json_files})


# @login_required
# def imageview(request, image_id):
#     image = get_object_or_404(Image, id=image_id)
#     with open(os.path.join(settings.IMAGE_PATH, image.path()), "rb") as f:
#         return HttpResponse(f.read(), content_type="image/jpeg")

@login_required
def view_image(request, image_id):
    """
    This view is to authenticate direct access to the images via nginx auth_request directive

    it will return forbidden on if the user is not authenticated
    """
    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    #image_cache = cache.get('SlideCache')
    #if image_cache is None:
    #    image_cache = SlideCache(cache_size=10)
    #    cache.set('SlideCache', image_cache)
    #image_cache = SlideCache(cache_size=10)

    file_path = os.path.join(settings.IMAGE_PATH, image.path())
    slide = image_cache.get(file_path)

    response = HttpResponse(slide.get_dzi("jpeg"), content_type='application/xml')
    return response

@login_required
def view_thumbnail(request, image_id):
    """
    This view is to authenticate direct access to the images via nginx auth_request directive

    it will return forbidden on if the user is not authenticated
    """
    
    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    file_path = image.path()

    if Path(image.thumbnail_path()).exists():
        tile = PIL_Image.open(image.thumbnail_path())
    else:
        slide = image_cache.get(file_path)
        tile = slide._osr.get_thumbnail((128,128))
        tile.save(image.thumbnail_path())

    buf = PILBytesIO()
    tile.save(buf, 'jpeg', quality=90)
    response = HttpResponse(buf.getvalue(), content_type='image/%s' % format)

    return response


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
    for plugin in plugin_finder.filter_plugins(product_name=''):
        plugins.append(plugin.instance.getPluginStatisticsElements(image, request.user, options))


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
def view_image_navigator_overlay_tile(request, tile_path):
    """
    This view is to authenticate direct access to the images via nginx auth_request directive

    it will return forbidden on if the user is not authenticated
    """
    results = re.search("((\d+)_(\D+)/(\d+)/(\d+)_(\d+).(png|jpeg))", tile_path)
    image_id = int(results.group(2))
    level = int(results.group(4))
    col = int(results.group(5))
    row = int(results.group(6))
    format = results.group(7)

    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    file_path = os.path.join(settings.IMAGE_PATH, image.path())
    slide = image_cache.get(file_path)

    tile = slide.get_tile(level, (col, row))

    # replace with databse call to imageset.product
    for product in image.image_set.product_set.all():
        for plugin in plugin_finder.filter_plugins(product_name=product.name, navigation_view_policy=ViewPolicy.RGB_IMAGE):
            tile = plugin.instance.getNavigationViewOverlay(image)

    buf = PILBytesIO()
    tile.save(buf, format, quality=90)
    response = HttpResponse(buf.getvalue(), content_type='image/%s' % format)

    return response

@login_required
def view_image_tile(request, tile_path):
    """
    This view is to authenticate direct access to the images via nginx auth_request directive

    it will return forbidden on if the user is not authenticated
    """
    results = re.search("((\d+)_(\D+)/(\d+)/(\d+)_(\d+).(png|jpeg))", tile_path)
    image_id = int(results.group(2))
    level = int(results.group(4))
    col = int(results.group(5))
    row = int(results.group(6))
    format = results.group(7)

    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return HttpResponseForbidden()

    file_path = os.path.join(settings.IMAGE_PATH, image.path())
    slide = image_cache.get(file_path)


    tile = slide.get_tile(level, (col, row))

    buf = PILBytesIO()
    tile.save(buf, format, quality=90)
    response = HttpResponse(buf.getvalue(), content_type='image/%s' % format)

    return response

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
    image = get_object_or_404(Image, id=image_id)
    if not image.image_set.has_perm('read', request.user):
        return Response({'message': 'you do not have the permission to access this imageset'
        }, status=HTTP_403_FORBIDDEN)

    file_path = os.path.join(settings.IMAGE_PATH, image.path())
    _, fname = os.path.split(file_path)
    response = FileResponse(open(file_path, 'rb'), content_type='application/zip')

    response['Content-Length'] = os.path.getsize(file_path)
    response['Content-Disposition'] = "attachment; filename={}".format(fname)

    return response

@api_view(['GET'])
def delete_images_api(request, image_id) -> Response:
    image = get_object_or_404(Image, id=image_id)
    if image.image_set.has_perm('delete_images', request.user) and not image.image_set.image_lock:
        try:
            os.remove(os.path.join(settings.IMAGE_PATH, image.path()))
        except:
            pass
        image.delete()
        return Response({}, status=HTTP_200_OK)
    return Response({}, status=HTTP_403_FORBIDDEN)


@login_required
def delete_images(request, image_id):
    image = get_object_or_404(Image, id=image_id)
    if image.image_set.has_perm('delete_images', request.user) and not image.image_set.image_lock:
        os.remove(os.path.join(settings.IMAGE_PATH, image.path()))
        image.delete()
        next_image = request.POST.get('next-image-id', '')
        if next_image == '':
            return redirect(reverse('images:view_imageset', args=(image.image_set.id,)))
        else:
            return redirect(reverse('annotations:annotate', args=(next_image,)))


@login_required
def view_imageset(request, image_set_id):
    imageset = get_object_or_404(ImageSet, id=image_set_id)
    if not imageset.has_perm('read', request.user):
        messages.warning(request, 'you do not have the permission to access this imageset')
        return redirect(reverse('images:index'))
    # images the imageset contains
    images = imageset.get_unverified_ids(request.user)

    # the saved exports of the imageset
    exports = Export.objects.filter(image_set=image_set_id).order_by('-id')[:5]
    filtered = False
    form_filter = request.POST.get('filter')
    if request.method == "POST" and form_filter is not None:
        filtered = True
        # filter images for missing annotationtype
        images = images.exclude(
            annotations__annotation_type_id=request.POST.get("selected_annotation_type"))
    # a list of annotation types used in the imageset
    all_annotation_types = AnnotationType.objects.filter(active=True, name__in=[tag.name for tag in imageset.set_tags.all()])

    if imageset.collaboration_type == ImageSet.CollaborationTypes.COLLABORATIVE:
        annotations = Annotation.objects.filter(
            image__image_set=imageset,
            deleted=False,
            annotation_type__active=True).order_by("id")
        annotation_types = AnnotationType.objects.filter(annotation__image__image_set=imageset, active=True, annotation__deleted=False)\
            .distinct().order_by('sort_order')\
            .annotate(count=Count('annotation'),
                      in_image_count=Count('annotation', filter=Q(annotation__verifications__verified=True)),
                      not_in_image_count=Count('annotation', filter=Q(annotation__verifications__verified=False)))

    if imageset.collaboration_type == ImageSet.CollaborationTypes.COMPETITIVE:
        annotations = Annotation.objects.filter(
            image__image_set=imageset,
            deleted=False,
            user=request.user,
            annotation_type__active=True).order_by("id")
        annotation_types = AnnotationType.objects.filter(annotation__image__image_set=imageset,
                                                         active=True,  annotation__deleted=False,
                                                         annotation__user=request.user)\
            .distinct().order_by('sort_order')\
            .annotate(count=Count('annotation'),
                      in_image_count=Count('annotation', filter=Q(annotation__verifications__verified=True, annotation__user=request.user)),
                      not_in_image_count=Count('annotation', filter=Q(annotation__verifications__verified=False, annotation__user=request.user)))

    first_annotation = annotations.first()
    user_teams = Team.objects.filter(members=request.user)
    imageset_edit_form = ImageSetEditForm(instance=imageset)
    imageset_edit_form.fields['main_annotation_type'].queryset = AnnotationType.objects\
        .filter(active=True, product__in=imageset.product_set.all()).order_by('product', 'sort_order')

    copyImageSetForm = CopyImageSetForm()
    copyImageSetForm.fields['imagesets'].queryset = ImageSet.objects\
        .filter(Q(team__in=request.user.team_set.all())|Q(public=True))

    all_products = Product.objects.filter(team=imageset.team).order_by('name')
    return render(request, 'images/imageset.html', {
        'images': images,
        'image_count': images.count(),
        'annotationcount': annotations.count(),
        'imageset': imageset,
        'all_products': all_products,
        'annotationtypes': annotation_types,
        'annotation_types': annotation_types,
        'all_annotation_types': all_annotation_types,
        'first_annotation': first_annotation,
        'exports': exports,
        'filtered': filtered,
        'edit_form': imageset_edit_form,
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
    context_offset = 0.15

    if not imageset.has_perm('edit_set', request.user):
        messages.warning(request,
                         _('You do not have permission to edit this imageset.'))
        return redirect(reverse('images:view_imageset', args=(imageset.id,)))

    if (which('convert') == None):
        return Response({
            'Error': "ImageMagick  not installed",
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
        annotations = Annotation.objects.filter(image__image_set=imageset, deleted=False, vector__isnull=False,
                                                 annotation_type=annotation_type).order_by('image')
        annotation_count = annotations.count()
        x_images = math.ceil(math.sqrt(annotation_count))
        y_images = math.ceil(math.sqrt(annotation_count))

        patch_width = int(annotation_type.default_width + annotation_type.default_width * context_offset)
        patch_height = int(annotation_type.default_height + annotation_type.default_height * context_offset)

        x_total_size = int(x_images * patch_width)
        y_total_size = int(y_images * patch_height)

        result_image = np.zeros(shape=(x_total_size, y_total_size, 3), dtype=np.uint8)

        ids = list(annotations.values_list('id', flat=True))

        name = '{0}_{1}.tif'.format(annotation_type.product.name, annotation_type.name)
        result_image_names[name] = annotation_count

        new_image = imageset.images.filter(name=name,
                                           image_type=Image.ImageSourceTypes.SERVER_GENERATED).first()
        if new_image is None:
            new_image = Image(
                name = name,
                image_set = imageset,
                filename = name+"f",
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

                file_path = os.path.join(settings.IMAGE_PATH, anno.image.path())
                if file_path != last_path:
                    slide = openslide.open_slide(str(file_path))
                    last_path = file_path

                x_ori = anno.min_x
                y_ori = anno.min_y
                w_ori = anno.max_x - anno.min_x
                h_ori = anno.max_y - anno.min_y

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
                for i in range(1, (len(anno.vector) // 2) + 1):
                    #  bring to coordinate center
                    anno.vector['x' + str(i)] = int(anno.vector['x' + str(i)] + x_min)
                    anno.vector['y' + str(i)] = int(anno.vector['y' + str(i)] + y_min)

                anno.id = None
                anno.save()

                result_image[y_min:y_max, x_min:x_max] = patch

        if annotation_count > 0:
            source_path = os.path.join(settings.IMAGE_PATH, new_image.path()).replace(".tiff", ".tif")
            destination_path = os.path.join(settings.IMAGE_PATH, new_image.path())

            with TiffWriter(source_path, bigtiff=False) as tif:
                tif.save(result_image, photometric='rgb') #compress=6, 

            if (platform.system() == "Linux"):
                os.system('nice -n 19 convert "{0}" -define tiff:tile-geometry=254x254 ptif:"{1}"'.format(
                                    source_path, destination_path))
            else:
                os.system('convert "{0}" -define tiff:tile-geometry=254x254 ptif:"{1}"'
                    .format(source_path, destination_path))

            os.remove(source_path)

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
        shutil.rmtree(imageset.root_path())
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
            print(line)
            if line in ('', "b'\n'"):
                continue
            dec_line = line.decode().replace('\n', '').replace(',}', '}')
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
        filter_annotation_type_id = request.query_params.get(
            'filter_annotation_type_id')
    except (KeyError, TypeError, ValueError):
        raise ParseError

    image_set = get_object_or_404(ImageSet, pk=image_set_id)

    if not image_set.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    serializer = ImageSetSerializer(image_set)
    serialized_image_set = serializer.data
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
