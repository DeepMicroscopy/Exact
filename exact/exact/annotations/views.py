import datetime
import io
import time
import pytz
from timeit import default_timer as timer

from django.conf import settings
import logging
from django.core.cache import cache
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from rest_framework.decorators import api_view
from rest_framework.exceptions import ParseError
from rest_framework.response import Response
from rest_framework.status import HTTP_201_CREATED, HTTP_400_BAD_REQUEST, HTTP_200_OK, \
    HTTP_403_FORBIDDEN

from exact.administration.models import Product
from exact.annotations.forms import ExportFormatCreationForm, ExportFormatEditForm, AnnotationMediafileForm
from exact.annotations.models import Annotation, AnnotationType, Export, \
    Verification, ExportFormat, LogImageAction, AnnotationMediaFile, SegmentationTile
from exact.annotations.serializers import AnnotationSerializer, AnnotationTypeSerializer, \
    AnnotationSerializerFast, serialize_annotation, AnnotationMediaFileSerializer
from exact.images.models import Image, ImageSet
from exact.users.models import Team
from exact.processing.models import Plugin, PluginJob, PluginResult

logger = logging.getLogger('django')

def export_auth(request, export_id):
    if request.user.is_authenticated():
        return HttpResponse('authenticated')
    return HttpResponseForbidden('authentication denied')


@login_required
def annotate(request, image_id):
    #start = timer()
    show_processing=request.user.has_perm('processing.use_server_side_plugins') & settings.SHOW_PROCESSING_PANEL
    selected_image = get_object_or_404(Image, id=image_id)
    imageset_perms = selected_image.image_set.get_perms(request.user)

    availablePlugins=[]
    jobsQueue=[]

    if show_processing:
        availablePlugins = Plugin.objects.filter(products__in=selected_image.image_set.product_set.all())
        for i,plugin in enumerate(availablePlugins):
            pgn=PluginJob.objects.filter(image=image_id).filter(plugin=plugin)
            availablePlugins[i].processing_complete=-1
            if pgn.count()>0:
                availablePlugins[i].processing_complete = pgn.first().processing_complete
                if hasattr(pgn.first(),'result'):
                    availablePlugins[i].result = pgn.first().result
                

    if 'read' in imageset_perms:
        set_images = selected_image.image_set.images.all().order_by('id')
        hasMediaFiles = AnnotationMediaFile.objects.filter(annotation__image__in=set_images).count() > 0
        annotation_types = AnnotationType.objects.filter(active=True,
                                                         product__in=selected_image.image_set.product_set.all())\
            .order_by('sort_order')  # for the dropdown option

        global_annotation_types = annotation_types.filter(vector_type=AnnotationType.VECTOR_TYPE.GLOBAL)
        annotation_types = annotation_types.exclude(vector_type=AnnotationType.VECTOR_TYPE.GLOBAL)

        show_advanced_options = settings.SHOW_ADVANCED_OPTIONS

        total_annotations = selected_image.annotations.filter(deleted=False).count()
        imageset_lock = selected_image.image_set.image_lock

        asthma = cache.get(f"{selected_image.image_set.id}_contains_asthma")
        if asthma is None:
            asthma = selected_image.image_set.product_set.filter(Q(name__icontains="asthma") 
                        | Q(name__icontains="astma")).first()
            asthma = True if asthma is not None else False
            if hasattr(cache, "delete_pattern"):
                cache.set(f"{selected_image.image_set.id}_contains_asthma", asthma, 5*60)

        template = 'annotations/annotate_v2.html' if hasattr(request.user,'prefs') and hasattr(request.user.prefs,'frontend') and request.user.prefs.frontend==2 else 'annotations/annotate.html'

        response = render(request, template, {
            'team': selected_image.image_set.team,
            'selected_image': selected_image,
            'imageset_perms': imageset_perms,
            'imageset_lock': imageset_lock,
            'set_images': set_images,
            'total_annotations': total_annotations,
            'annotation_types': annotation_types,
            'HasMediaFiles': hasMediaFiles,
            'jobsQueue' : jobsQueue,
            'availablePlugins':availablePlugins,
            'global_annotation_types': global_annotation_types,
            'show_advanced_options':show_advanced_options,
            'show_processing':show_processing,
            'user_id': request.user.id,
            'asthma': asthma,
            "USE_CDN_WSI": settings.USE_CDN_WSI
        })
        
        # logger.info(f"{timer() - start:.4f};Load annotation page")
        return response
    else:
        return redirect(reverse('images:view_imageset', args=(selected_image.image_set.id,)))


@login_required
def delete_annotation(request, annotation_id):
    annotation = get_object_or_404(Annotation, id=annotation_id)
    if annotation.image.image_set.has_perm('delete_annotation', request.user):
        annotation.delete()
    return redirect(reverse('annotations:annotate', args=(annotation.image.id,)))


@login_required
def create_export(request, image_set_id):
    imageset = get_object_or_404(ImageSet, id=image_set_id)
    if imageset.has_perm('create_export', request.user):
        export = request.POST.get('export')
        if request.method == 'POST' and export is not None:
            selected_format = request.POST['export_format']
            format = get_object_or_404(ExportFormat, id=selected_format)
            export_text, annotation_count, export_filename = export_format(format, imageset)

            export = Export(image_set=imageset,
                            user=request.user,
                            annotation_count=annotation_count,
                            export_text=export_text,
                            format=format)
            export.save()
            export.filename = export_filename.replace('%%exportid', str(export.id))
            export.save()

    return redirect(reverse('images:view_imageset', args=(image_set_id,)))


@login_required
def download_export(request, export_id):
    db_export = get_object_or_404(Export, id=export_id)
    export = db_export.export_text
    response = HttpResponse(export, content_type='text/plain')
    response['Content-Disposition'] = 'attachment; filename="{}"'.format(db_export.filename)
    return response


@login_required
def manage_annotations(request, image_set_id):
    filter = request.GET.get("filter", None)
    value = request.GET.get("value", None)
    include_deleted = bool(request.GET.get('include_deleted', False))
    userteams = Team.objects.filter(members=request.user)
    imagesets = ImageSet.objects.select_related('team').filter(
        Q(team__in=userteams) | Q(public=True))
    imageset = get_object_or_404(ImageSet, id=image_set_id)
    images = Image.objects.filter(image_set=imageset)
    annotations = Annotation.objects.annotate_verification_difference() \
        .select_related('image', 'user', 'last_editor',
                        'annotation_type')


    annotations = annotations.filter(image__in=images, annotation_type__active=True, deleted=include_deleted)
    try:
        if filter == 'annotation-type':
            annotations = annotations.filter(annotation_type__name=value)
        elif filter == 'older-than':
            date = datetime.datetime.strptime(value, '%Y-%m-%d').date()
            annotations = annotations.filter(time__date__lt=date)
        elif filter == 'newer-than':
            date = datetime.datetime.strptime(value, '%Y-%m-%d').date()
            annotations = annotations.filter(time__date__gt=date)
        elif filter == 'latest-change-by' and value != '':
            annotations = annotations.filter((Q(user__username=value) & Q(last_editor=None)) | Q(last_editor__username=value))
        elif filter == 'verifications-min':
            annotations = annotations.filter(verification_difference__gte=value)
        elif filter == 'verifications-max':
            annotations = annotations.filter(verification_difference__lte=value)
    except ValueError:
        annotations = Annotation.objects.none()
        messages.warning(request, 'Invalid filter')
    annotations = annotations.order_by('id')
    paginator = Paginator(annotations, 50)
    page = request.GET.get('page')
    page_annotations = paginator.get_page(page)
    return render(request, 'annotations/manage_annotations.html', {
        'selected_image_set': imageset,
        'image_sets': imagesets,
        'annotations': page_annotations,
        'filter': filter,
        'value': value,
        'delete_permission': imageset.has_perm('edit_set', request.user),
        'annotation_count': annotations.count(),
    })


@login_required
def delete_annotations(request, image_set_id):
    filter = request.POST.get("filter", None)
    value = request.POST.get("value", None)
    imageset = get_object_or_404(ImageSet, id=image_set_id)
    images = Image.objects.filter(image_set=imageset)
    annotations = Annotation.objects.annotate_verification_difference()\
        .select_related('image', 'user', 'last_editor', 'annotation_type')\
        .filter(image__in=images, annotation_type__active=True)
    print(filter, value)
    if imageset.has_perm('edit_set', request.user):
        try:
            if filter == 'annotation-type':
                annotations = annotations.filter(annotation_type__name=value)
            elif filter == 'older-than':
                date = datetime.datetime.strptime(value, '%Y-%m-%d').date()
                annotations = annotations.filter(time__date__lt=date)
            elif filter == 'newer-than':
                date = datetime.datetime.strptime(value, '%Y-%m-%d').date()
                annotations = annotations.filter(time__date__gt=date)
            elif filter == 'latest-change-by' and value != '':
                annotations = annotations.filter((Q(user__username=value) & Q(last_editor=None)) | Q(last_editor__username=value))
            elif filter == 'verifications-min':
                annotations = annotations.filter(verification_difference__gte=value)
            elif filter == 'verifications-max':
                annotations = annotations.filter(verification_difference__lte=value)
            count = annotations.count()
            annotations.delete()
            messages.warning(request, 'Deleted ' + str(count) + ' annotation' + ('s' if count != 1 else ''))
        except ValueError:
            messages.warning(request, 'Invalid filter')
    else:
        messages.warning(request, 'No permission')
    return redirect(reverse('annotations:manage_annotations', args=(image_set_id,)))


@login_required
def annotate_set(request, imageset_id):
    if request.method == 'POST' and 'nii_annotation_type' in request.POST.keys():
        annotation_type = get_object_or_404(AnnotationType, id=int(request.POST['nii_annotation_type']))
        imageset = get_object_or_404(ImageSet, id=imageset_id)
        verify_annotations = 'verify' in request.POST.keys()
        if 'edit_set' in imageset.get_perms(request.user):
            images = Image.objects.filter(image_set=imageset)
            for image in images:
                if not Annotation.similar_annotations(None, image, annotation_type):
                    with transaction.atomic():
                        annotation = Annotation.objects.create(
                            vector=None, image=image,
                            annotation_type=annotation_type, user=None)
                        # Automatically verify for owner
                        if verify_annotations:
                            annotation.verify(request.user, True)
        else:
            messages.error(request, 'You have no permission to annotate all images in the set!')
    else:
        messages.error(request, 'There was a form error!')
    return redirect(reverse('images:view_imageset', args=(imageset_id,)))


@login_required
def verify(request, annotation_id):
    # here the stuff we got via POST gets put in the DB
    annotation = get_object_or_404(
        Annotation.objects.select_related(), id=annotation_id)
    if not annotation.image.image_set.has_perm('verify', request.user):
        messages.warning(request, "You have no permission to verify this tag!")
        return redirect(
            reverse('images:view_imageset', args=(annotation.image.image_set.id,)))

    image = get_object_or_404(Image, id=annotation.image.id)

    return render(request, 'annotations/verification.html', {
        'image': image,
        'annotation': annotation,
    })


def apply_conditional(string, conditional, keep):
    """
    :param conditional: %%ifbla
    :param keep: Ob der String mit oder ohne das gefundene zurueckgegeben werden soll
    """
    while string.find(conditional) != -1:
        findstring = string[string.find(conditional):]
        found = findstring[len(conditional):findstring.find("%%endif")]
        if keep:
            string = string.replace(conditional + found + "%%endif", found)
        else:
            string = string.replace(conditional + found + "%%endif", "")
    return string


def export_format(export_format_name, imageset):
    images = Image.objects.filter(image_set=imageset)
    export_format = export_format_name
    file_name = export_format.name_format

    placeholders_filename = {
        '%%imageset': imageset.name,
        '%%team': imageset.team.name,
        '%%setlocation': imageset.location,
    }
    for key, value in placeholders_filename.items():
                        file_name = file_name.replace(key, str(value))

    min_verifications = export_format.min_verifications
    annotation_counter = 0
    log_image_action_content = ''

    for image in images:
        log_image_actions = LogImageAction.objects.filter(image=image)
        if log_image_actions:
            for image_action in log_image_actions:
                log_image_action_content += "[{0}|{1}|{2}|{3}]\n".format(image.name ,image_action.user.username, image_action.time, image_action.action)

    if export_format_name.image_aggregation:
        image_content = '\n'

        for image in images:
            
            annotations = Annotation.objects\
                .filter(image=image,
                        annotation_type__in=export_format.annotations_types.all())\
                .select_related('image')

            if "deleted" not in export_format.annotation_format:
                annotations = annotations.filter(deleted=False)

            if not export_format.include_blurred:
                annotations = annotations.exclude(_blurred=True)
            if not export_format.include_concealed:
                annotations = annotations.exclude(_concealed=True)
            if annotations:
                annotation_content = ''
                for annotation in annotations:
                    annotation_counter += 1
                    if annotation.not_in_image:
                        formatted_annotation = export_format.not_in_image_format
                        placeholders_annotation = {
                            '%%imageset': imageset.name,
                            '%%imagewidth': annotation.image.width,
                            '%%imageheight': annotation.image.height,
                            '%%imagename': image.name,
                            '%%type': annotation.annotation_type.name,
                            #'%%veriamount': annotation.verification_difference,
                        }
                    else:
                        formatted_vector = str()
                        for counter1 in range(1, (len(annotation.vector) // 2) + 1):
                            vector_line = export_format.vector_format
                            placeholders_vector = {
                                '%%count0': counter1 - 1,
                                '%%count1': counter1,
                                '%%x': annotation.vector['x' + str(counter1)],
                                '%%relx': annotation.get_relative_vector_element('x' + str(counter1)),
                                '%%y': annotation.vector['y' + str(counter1)],
                                '%%rely': annotation.get_relative_vector_element('y' + str(counter1)),
                                '%%br': '\n'
                            }
                            for key, value in placeholders_vector.items():
                                vector_line = vector_line.replace(key, str(value))
                            formatted_vector += vector_line
                        formatted_annotation = export_format.annotation_format
                        formatted_annotation = apply_conditional(formatted_annotation, '%%ifblurred', annotation.blurred)
                        formatted_annotation = apply_conditional(formatted_annotation, '%%ifnotblurred', not annotation.blurred)
                        formatted_annotation = apply_conditional(formatted_annotation, '%%ifconcealed', annotation.concealed)
                        formatted_annotation = apply_conditional(formatted_annotation, '%%ifnotconcealed', not annotation.concealed)
                        placeholders_annotation = {
                            '%%imageset': imageset.name,
                            '%%imagewidth': image.width,
                            '%%imageheight': image.height,
                            '%%imagename': image.name,
                            '%%type': annotation.annotation_type.name,
                            #'%%veriamount': annotation.verification_difference,
                            '%%vector': formatted_vector,
                            '%%frame': annotation.vector["frame"] if "frame" in annotation.vector else 1,
                            #CRUD Infos
                            '%%first_editor': annotation.user.username,
                            '%%first_timepoint': annotation.time,
                            '%%last_editor':  annotation.last_editor.username if annotation.last_editor is not None else -1,
                            '%%last_timepoint': annotation.last_edit_time,
                            '%%UUID': annotation.unique_identifier,
                            '%%meta_data': annotation.meta_data,
                            '%%deleted': annotation.deleted,

                            # absolute values
                            '%%rad': annotation.radius,
                            '%%dia': annotation.diameter,
                            '%%cx': annotation.center['xc'],
                            '%%cy': annotation.center['yc'],
                            '%%minx': annotation.min_x,
                            '%%maxx': annotation.max_x,
                            '%%miny': annotation.min_y,
                            '%%maxy': annotation.max_y,
                            '%%width': annotation.width,
                            '%%height': annotation.height,
                            # relative values
                            '%%relrad': annotation.relative_radius,
                            '%%reldia': annotation.relative_diameter,
                            '%%relcx': annotation.relative_center['xc'],
                            '%%relcy': annotation.relative_center['yc'],
                            '%%relminx': annotation.relative_min_x,
                            '%%relmaxx': annotation.relative_max_x,
                            '%%relminy': annotation.relative_min_y,
                            '%%relmaxy': annotation.relative_max_y,
                            '%%relwidth': annotation.relative_width,
                            '%%relheight': annotation.relative_height,
                        }
                    for key, value in placeholders_annotation.items():
                        formatted_annotation = formatted_annotation\
                            .replace(key, str(value)).replace(',}', '}')
                    annotation_content += formatted_annotation + '\n'

                formatted_image = export_format.image_format
                placeholders_image = {
                    '%%imageset': imageset.name,
                    '%%imagewidth': image.width,
                    '%%imageheight': image.height,
                    '%%imagename': image.name,
                    '%%annotations': annotation_content,
                    '%%annoamount': annotations.count(),
                    '%%frame': annotation.vector["frame"] if "frame" in annotation.vector else 1
                }
                for key, value in placeholders_image.items():
                    formatted_image = formatted_image.replace(key, str(value))
                image_content += formatted_image + '\n'
        formatted_content = image_content
    else:

        annotations = Annotation.objects\
                .filter(image__in=images,
                        annotation_type__in=export_format.annotations_types.all())\
                .select_related('image')
        if "deleted" not in export_format.annotation_format:
             annotations = annotations.filter(deleted=False)

        if not export_format.include_blurred:
            annotations = annotations.exclude(_blurred=True)
        if not export_format.include_concealed:
            annotations = annotations.exclude(_concealed=True)
        annotation_content = '\n'
        for annotation in annotations:
            annotation_counter += 1
            if annotation.not_in_image:
                formatted_annotation = export_format.not_in_image_format
                placeholders_annotation = {
                    '%%imageset': imageset.name,
                    '%%imagewidth': annotation.image.width,
                    '%%imageheight': annotation.image.height,
                    '%%imagename': annotation.image.name,
                    '%%type': annotation.annotation_type.name,
                    #'%%veriamount': annotation.verification_difference,
                }
            else:
                formatted_vector = str()
                for counter1 in range(1, (len(annotation.vector) // 2) + 1):
                    vector_line = export_format.vector_format
                    placeholders_vector = {
                        '%%count0': counter1 - 1,
                        '%%count1': counter1,
                        '%%x': annotation.vector['x' + str(counter1)],
                        '%%relx': annotation.get_relative_vector_element('x' + str(counter1)),
                        '%%y': annotation.vector['y' + str(counter1)],
                        '%%rely': annotation.get_relative_vector_element('y' + str(counter1)),
                        '%%br': '\n'
                    }
                    for key, value in placeholders_vector.items():
                        vector_line = vector_line.replace(key, str(value))
                    formatted_vector += vector_line
                formatted_annotation = export_format.annotation_format
                formatted_annotation = apply_conditional(formatted_annotation, '%%ifblurred', annotation.blurred)
                formatted_annotation = apply_conditional(formatted_annotation, '%%ifnotblurred', not annotation.blurred)
                formatted_annotation = apply_conditional(formatted_annotation, '%%ifconcealed', annotation.concealed)
                formatted_annotation = apply_conditional(formatted_annotation, '%%ifnotconcealed', not annotation.concealed)
                placeholders_annotation = {
                    '%%imageset': imageset.name,
                    '%%imagewidth': annotation.image.width,
                    '%%imageheight': annotation.image.height,
                    '%%imagename': annotation.image.name,
                    '%%type': annotation.annotation_type.name,
                    #'%%veriamount': annotation.verification_difference,
                    '%%vector': formatted_vector,
                    '%%frame': annotation.vector["frame"] if "frame" in annotation.vector else 1,
                    #CRUD Infos
                    '%%first_editor': annotation.user.username,
                    '%%first_timepoint': annotation.time,
                    '%%last_editor': annotation.last_editor.username if annotation.last_editor is not None else -1,
                    '%%last_timepoint': annotation.last_edit_time,
                    '%%UUID': annotation.unique_identifier,
                    '%%meta_data': annotation.meta_data,
                    '%%deleted': annotation.deleted,

                    # absolute values
                    '%%rad': annotation.radius,
                    '%%dia': annotation.diameter,
                    '%%cx': annotation.center['xc'],
                    '%%cy': annotation.center['yc'],
                    '%%minx': annotation.min_x,
                    '%%miny': annotation.min_y,
                    '%%maxx': annotation.max_x,
                    '%%maxy': annotation.max_y,
                    '%%width': annotation.width,
                    '%%height': annotation.height,
                    # relative values
                    '%%relrad': annotation.relative_radius,
                    '%%reldia': annotation.relative_diameter,
                    '%%relcx': annotation.relative_center['xc'],
                    '%%relcy': annotation.relative_center['yc'],
                    '%%relminx': annotation.relative_min_x,
                    '%%relminy': annotation.relative_min_y,
                    '%%relmaxx': annotation.relative_max_x,
                    '%%relmaxy': annotation.relative_max_y,
                    '%%relwidth': annotation.relative_width,
                    '%%relheight': annotation.relative_height,
                }
            for key, value in placeholders_annotation.items():
                formatted_annotation = formatted_annotation.replace(key, str(value)).replace(',}', '}')
            annotation_content = annotation_content + formatted_annotation + '\n'
        formatted_content = annotation_content
    base_format = export_format.base_format
    placeholders_base = {
        '%%view': log_image_action_content,
        '%%content': formatted_content,
        '%%imageset': imageset.name,
        '%%setdescription': imageset.description,
        '%%team': imageset.team.name,
        '%%setlocation': imageset.location,
    }
    for key, value in placeholders_base.items():
        base_format = base_format.replace(key, str(value))
    return base_format, annotation_counter, file_name


@login_required
def create_exportformat(request):
    object_id = request.GET.get("id", None)
    mode = request.GET.get("mode", None)
    print(mode)
    if request.method == 'POST' and \
            'manage_export_formats' in \
            get_object_or_404(Team, id=request.POST['team'])\
            .get_perms(request.user):
        form = ExportFormatCreationForm(request.POST)

        if form.is_valid():
            if ExportFormat.objects.filter(name=form.cleaned_data.get('name')).exists():
                form.add_error(
                    'name',
                    _('The name is already in use by an export format.'))
            else:
                with transaction.atomic():

                    form.save()

                messages.success(request, _('The export format was created successfully.'))
                if object_id:
                    if mode == '0':
                        return redirect(reverse('images:view_imageset', args=(object_id,)))
                    if mode == '1':
                        return redirect(reverse('users:team', args=(object_id,)))
            return redirect(reverse('base:index'))
    else:
        form = ExportFormatCreationForm()
        form.fields['team'].queryset = Team.objects.filter(members=request.user)
        form.fields['annotations_types'].queryset = AnnotationType.objects.filter(product__in=Product.objects.
                                                                                  filter(team__in=Team.objects.
                                                                                         filter(members=request.user)))
    return render(request, 'annotations/create_exportformat.html', {
        'form': form,
        'mode': mode,
        'id': object_id,
    })


@login_required
def edit_exportformat(request, format_id):
    export_format = get_object_or_404(ExportFormat, id=format_id)

    if request.method == 'POST' and \
            'manage_export_formats' in export_format.team.get_perms(request.user):

        form = ExportFormatEditForm(request.POST, instance=export_format)
        if form.is_valid():
            if not export_format.name == form.cleaned_data.get('name') and \
                    ExportFormat.objects.filter(
                        name=form.cleaned_data.get('name')).exists():
                form.add_error(
                    'name',
                    _('The name is already in use by an export format.'))
                messages.error(request, _('The name is already in use by an export format.'))
            else:
                with transaction.atomic():

                    edited_export_format = form.save(commit=False)
                    edited_export_format.annotations_types.clear()
                    for annotation_type in form.cleaned_data['annotations_types']:
                        edited_export_format.annotations_types.add(annotation_type)
                    edited_export_format.save()

                messages.success(request, _('The export format was edited successfully.'))
        else:
            messages.error(request, _('There was an error editing the export format'))

    return redirect(reverse('users:team', args=(export_format.team.id,)))


@login_required
def delete_exportformat(request, format_id):
    export_format = get_object_or_404(ExportFormat, id=format_id)
    if 'manage_export_formats' in export_format.team.get_perms(request.user):
        export_format.delete()
        messages.success(request, _('Deleted export format successfully.'))
    else:
        messages.error(request, _('You are not permitted to delete export formats of this team!'))
    return redirect(reverse('users:team', args=(export_format.team.id,)))


@api_view(['POST'])
def api_create_annotation_mediafile(request, annotation_id, media_file_type) -> Response:
    annotation = get_object_or_404(Annotation, id=annotation_id)

    if not annotation.image.image_set.has_perm('edit_annotation', request.user):
        return Response({
            'detail': 'permission for editing annotations in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)


    media_files = []
    if request.method == 'POST':
        if request.FILES is None:
            return HttpResponseBadRequest('Must have files attached!')


        for f in list(request.FILES.values()):
            media_file = AnnotationMediaFile.objects.filter(name=f.name, annotation__id=annotation.id).first()

            if media_file is None:
                media_file = AnnotationMediaFile(
                    name = f.name,
                    media_file_type = int(media_file_type),
                    annotation = annotation,
                    file = f
                )

                media_file.save()
                media_files.append(media_file)

    serializer = AnnotationMediaFileSerializer(
        media_files,
        context={'request': request, },
        many=True)
    return Response(serializer.data, status=HTTP_200_OK)
            


@api_view(['POST'])
def api_delete_annotation_mediafile(request) -> Response:
    raise NotImplementedError

@api_view(['POST'])
def api_update_annotation_mediafile(request) -> Response:
    raise NotImplementedError



@api_view(['DELETE'])
def api_delete_annotation(request) -> Response:
    #TODO Depricated
    try:
        annotation_id = int(request.query_params['annotation_id'])
        keep_deleted_element = bool(request.query_params.get('keep_deleted_element', False))
    except (KeyError, TypeError, ValueError):
        raise ParseError

    annotation = get_object_or_404(
        Annotation.objects.select_related(), pk=annotation_id)

    if not annotation.image.image_set.has_perm('delete_annotation', request.user):
        return Response({
            'detail': 'permission for deleting annotations in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if keep_deleted_element:
        with transaction.atomic():
            annotation.last_editor = request.user
            annotation.deleted = True
            annotation.save()
    else:
        annotation.delete()

    annotation.id = annotation_id

    serializer = AnnotationSerializer(
        annotation,
        context={'request': request, },
        many=False)
    return Response({
        'annotations': serializer.data,
    }, status=HTTP_200_OK)


@api_view(['POST'])
def api_copy_annotation(request,source_annotation_id, target_image_id) -> Response:

    source_annotation = get_object_or_404(Annotation, pk=source_annotation_id)
    target_image = get_object_or_404(Image, pk=target_image_id)

    target_annotation_type = AnnotationType.objects.filter(product__in=target_image.image_set.product_set.all(),
                                                        vector_type=source_annotation.annotation_type.vector_type,
                                                        name=source_annotation.annotation_type.name).first()

    if target_annotation_type:
        source_annotation.image_id = target_image.id
        source_annotation.annotation_type = target_annotation_type
        source_annotation.id = None
        source_annotation.save()
    else:
        return Response({
            'detail': 'No target annotation type match the source annotation type {0}'
                .format(source_annotation.annotation_type.name),
        }, status=HTTP_403_FORBIDDEN)


    return Response({
        'annotations': serialize_annotation(source_annotation)
    }, status=HTTP_201_CREATED)


@api_view(['POST'])
def create_annotation(request) -> Response:
    #TODO Depricated
    try:
        image_id = int(request.data['image_id'])
        annotation_type_id = int(request.data['annotation_type_id'])
        vector = request.data['vector']
        blurred = request.data.get('blurred', False)
        concealed = request.data.get('concealed', False)
        tempid = request.data.get('tempid', False)
        description = request.data.get('description', "")
        meta_data = request.data.get('meta_data', None)
    except (KeyError, TypeError, ValueError):
        raise ParseError

    image = get_object_or_404(Image, pk=image_id)
    annotation_type = get_object_or_404(AnnotationType, pk=annotation_type_id)

    if not image.image_set.has_perm('annotate', request.user):
        return Response({
            'detail': 'permission for annotating in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if annotation_type.validate_vector(vector) == False:
        return Response({
            'detail': 'the vector is not valid',
        }, status=HTTP_400_BAD_REQUEST)

    # secure that just one global annotation per type exists!
    annotation = None
    if annotation_type.vector_type == 7:
        if image.image_set.collaboration_type == ImageSet.CollaborationTypes.COLLABORATIVE:
            annotation = Annotation.objects.filter(image=image, annotation_type=annotation_type).first()
        else:
            annotation = Annotation.objects.filter(image=image, annotation_type=annotation_type, user=request.user).first()


    if annotation is None:
        with transaction.atomic():
            annotation = Annotation.objects.create(
                vector=vector,
                image=image,
                annotation_type=annotation_type,
                user=request.user,
                last_editor=request.user,
                _blurred=blurred,
                _concealed=concealed,
                description=description,
                meta_data=meta_data
            )

            if "unique_identifier" in request.data:
                annotation.unique_identifier = request.data["unique_identifier"]
                annotation.save()
            
            # Automatically verify for owner
            annotation.verify(request.user, True)

            # SlideRunner sync requires the option to set the last edit time to have it in sync with the database
            if "last_edit_time" in request.data:
                image.annotations.filter(id=annotation.id).update(last_edit_time=datetime.datetime.strptime(request.data["last_edit_time"], "%Y-%m-%dT%H:%M:%S.%f"))
    elif annotation.deleted:
        # reactivate deleted annotation
        annotation.deleted = False
        annotation.save()

    return Response({
        'annotations': serialize_annotation(annotation),
        'tempid': tempid
    }, status=HTTP_201_CREATED)


#@login_required
@api_view(['GET'])
def load_annotations(request) -> Response:
    #TODO Depricated
    try:
        image_id = int(request.query_params['image_id'])
        since = request.query_params.get('since', None)
        min_x = request.query_params.get('min_x', None)
        max_x = request.query_params.get('max_x', None)
        min_y = request.query_params.get('min_y', None)
        max_y = request.query_params.get('max_y', None)
        vector_type = request.query_params.get('vector_type', None)
        include_deleted = bool(request.query_params.get('include_deleted', False))

    except (KeyError, TypeError, ValueError):
        raise ParseError

    image = get_object_or_404(Image, pk=image_id)

    if not image.image_set.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    annotations = image.annotations.select_related().filter(annotation_type__active=True)

    if image.image_set.collaboration_type == ImageSet.CollaborationTypes.COMPETITIVE:
        annotations = annotations.filter(user=request.user)

    if include_deleted is False:
        annotations = annotations.filter(deleted=include_deleted)

    if vector_type is not None:
        vector_type = int(vector_type)
        annotations = annotations.filter(annotation_type__vector_type=vector_type)

    if since is not None:
        annotations = annotations.filter(last_edit_time__gte=
                                         datetime.datetime.fromtimestamp(int(since)))
        annotations = annotations.filter(~Q(last_editor__username=request.user.username))

    if min_x is not None and min_y is not None:
        annotations = annotations.filter(vector__x1__gte=int(min_x), vector__y1__gte=int(min_y))

    if max_x is not None and max_y is not None:
        annotations = annotations.filter(vector__x1__lt=int(max_x), vector__y1__lt=int(max_y))

    data = [serialize_annotation(a) for a in annotations]

    respond = Response({
        'annotations': data,
    }, status=HTTP_200_OK)
    return respond


@login_required
@api_view(['GET'])
def load_set_annotations(request) -> Response:
    try:
        imageset_id = int(request.query_params['imageset_id'])
        include_deleted = bool(request.query_params.get('include_deleted', False))
    except (KeyError, TypeError, ValueError):
        raise ParseError

    imageset = get_object_or_404(ImageSet, pk=imageset_id)
    images = Image.objects.filter(image_set=imageset)
    annotations = Annotation.objects.filter(image__in=images,
                                            annotation_type__active=True,
                                            deleted=include_deleted)

    if not imageset.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    serializer = AnnotationSerializer(
        annotations.select_related().order_by('image__name', 'annotation_type__sort_order'),
        many=True,
        context={'request': request},
    )
    return Response({
        'annotations': serializer.data,
    }, status=HTTP_200_OK)


@api_view(['GET'])
def load_annotation_types(request) -> Response:

    annotation_types = None
    imageset = None
    if 'imageset_id' in request.query_params:
        imageset_id = int(request.query_params['imageset_id'])
        imageset = get_object_or_404(ImageSet, pk=imageset_id)
        annotation_types = AnnotationType.objects.filter(active=True,
                                                         product__in=imageset.product_set.all())\
            .order_by('sort_order')
    else:
        annotation_types = AnnotationType.objects.filter(active=True).order_by('sort_order')

    if imageset is not None and not imageset.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)


    serializer = AnnotationTypeSerializer(
        annotation_types,
        many=True,
        context={'request': request},
    )
    return Response({
        'annotation_types': serializer.data,
    }, status=HTTP_200_OK)


@login_required
@api_view(['GET'])
def load_set_annotation_types(request) -> Response:
    try:
        imageset_id = int(request.query_params['imageset_id'])
        include_deleted = bool(request.query_params.get('include_deleted', False))
    except (KeyError, TypeError, ValueError):
        raise ParseError

    imageset = get_object_or_404(ImageSet, pk=imageset_id)
    images = Image.objects.filter(image_set=imageset)
    annotations = Annotation.objects.filter(image__in=images,
                                            annotation_type__active=True,
                                            deleted=include_deleted)
    annotation_types = AnnotationType.objects.filter(
        active=True,
        annotation__in=annotations)\
        .distinct().order_by('sort_order')

    if not imageset.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    serializer = AnnotationTypeSerializer(
        annotation_types,
        many=True,
        context={'request': request},
    )
    return Response({
        'annotation_types': serializer.data,
    }, status=HTTP_200_OK)


@login_required
@api_view(['GET'])
def load_filtered_set_annotations(request) -> Response:
    #TODO Depricated
    try:
        imageset_id = int(request.query_params['imageset_id'])
        verified = request.query_params['verified'] == 'true'
        annotation_type_id = int(request.query_params['annotation_type'])
        include_deleted = bool(request.query_params.get('include_deleted', False))
    except (KeyError, TypeError, ValueError):
        raise ParseError

    imageset = get_object_or_404(ImageSet, pk=imageset_id)
    images = Image.objects.filter(image_set=imageset)
    annotations = Annotation.objects.filter(image__in=images,
                                            annotation_type__active=True,
                                            deleted=include_deleted).select_related()
    user_verifications = Verification.objects.filter(user=request.user, annotation__in=annotations)
    if annotation_type_id > -1:
        annotations = annotations.filter(annotation_type__id=annotation_type_id)
    if verified:
        annotations = [annotation for annotation in annotations if not user_verifications.filter(annotation=annotation).exists()]

    if not imageset.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    serializer = AnnotationSerializer(
        sorted(list(annotations), key=lambda annotation: annotation.image.id),
        many=True,
        context={'request': request},
    )
    return Response({
        'annotations': serializer.data,
    }, status=HTTP_200_OK)


@login_required
@api_view(['GET'])
def load_annotation(request) -> Response:
    #TODO Depricated
    try:
        annotation_id = int(request.query_params['annotation_id'])
    except (KeyError, TypeError, ValueError):
        raise ParseError

    annotation = get_object_or_404(Annotation, pk=annotation_id)

    if not annotation.image.image_set.has_perm('read', request.user):
        return Response({
            'detail': 'permission for reading this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    serializer = AnnotationSerializer(annotation,
                                      context={
                                          'request': request,
                                      },
                                      many=False)
    return Response({
        'annotation': serializer.data,
    }, status=HTTP_200_OK)


@api_view(['POST'])
def update_annotation(request) -> Response:
    #TODO Depricated
    try:
        annotation_id = int(request.data['annotation_id'])
        image_id = int(request.data['image_id'])
        annotation_type_id = int(request.data['annotation_type_id'])
        vector = request.data['vector']
        blurred = request.data.get('blurred', False)
        concealed = request.data.get('concealed', False)
        deleted = bool(request.data.get('deleted', False))
        description = request.data.get('description', "")
        meta_data = request.data.get('meta_data', None)
    except (KeyError, TypeError, ValueError):
        raise ParseError

    annotation = get_object_or_404(Annotation, pk=annotation_id)

    annotation_type = get_object_or_404(AnnotationType, pk=annotation_type_id)

    if annotation.image_id != image_id:
        return Response({
            'detail': 'the image id does not match the annotation id.',
        }, status=HTTP_400_BAD_REQUEST)

    if not annotation.image.image_set.has_perm('edit_annotation', request.user):
        return Response({
            'detail': 'permission for updating annotations in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if annotation_type.validate_vector(vector) == False:
        return Response({
            'detail': 'the vector is not valid',
        }, status=HTTP_400_BAD_REQUEST)


    with transaction.atomic():
        annotation.annotation_type = annotation_type
        annotation.vector = vector
        annotation._concealed = concealed
        annotation._blurred = blurred
        annotation.last_editor = request.user
        annotation.annotation_type = annotation_type
        annotation.deleted = deleted
        annotation.description = description
        annotation.meta_data = meta_data
        annotation.save()


        # Automatically verify for owner
        annotation.verify(request.user, True)

    # SlideRunner sync requires the option to set the last edit time to have it in sync with the database
    if "last_edit_time" in request.data:
        annotation.image.annotations.filter(id=annotation.id).update(last_edit_time=datetime.datetime.strptime(request.data["last_edit_time"], "%Y-%m-%dT%H:%M:%S.%f"))


    return Response({
        'annotations': serialize_annotation(annotation),
    }, status=HTTP_200_OK)


@login_required
@api_view(['POST'])
def api_verify_annotation(request) -> Response:
    try:
        annotation_id = int(request.data['annotation_id'])
        if request.data['state'] == 'accept':
            state = True
        elif request.data['state'] == 'reject':
            state = False
        else:
            raise ParseError

    except (KeyError, TypeError, ValueError):
        raise ParseError

    annotation = get_object_or_404(Annotation, pk=annotation_id)

    if not annotation.image.image_set.has_perm('verify', request.user):
        return Response({
            'detail': 'permission for verifying annotations in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    if state:
        annotation.verify(request.user, True)
        serializer = serialize_annotation(annotation)

        if Verification.objects.filter(
                user=request.user,
                verified=state,
                annotation=annotation).exists():
            return Response({
                'annotation': serializer,
                'detail': 'the user already verified this annotation and verified it now',
            }, status=HTTP_200_OK)
        return Response({
            'annotation': serializer,
            'detail': 'you verified the last annotation',
        }, status=HTTP_200_OK)
    else:
        annotation.verify(request.user, False)
        serializer = serialize_annotation(annotation)

        if Verification.objects.filter(
                user=request.user,
                verified=state,
                annotation=annotation).exists():
            return Response({
                'annotation': serializer,
                'detail': 'the user already verified this annotation and rejected it now',
            }, status=HTTP_200_OK)
        return Response({
            'annotation': serializer,
            'detail': 'you rejected the last annotation',
        }, status=HTTP_200_OK)


@login_required
@api_view(['POST'])
def api_blurred_concealed_annotation(request) -> Response:
    try:
        annotation_id = int(request.data['annotation_id'])
        blurred = request.data['blurred']
        concealed = request.data['concealed']

    except (KeyError, TypeError, ValueError):
        raise ParseError

    annotation = get_object_or_404(Annotation, pk=annotation_id)

    if not annotation.image.image_set.has_perm('edit_annotation', request.user):
        return Response({
            'detail': 'permission for verifying annotations in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)

    with transaction.atomic():
        annotation._concealed = concealed
        annotation._blurred = blurred
        annotation.save()
    return Response({
        'detail': 'you updated the last annotation',
    }, status=HTTP_200_OK)


# ---------------------------------------------------------------------------
# Segmentation tile endpoints
# ---------------------------------------------------------------------------

_SEG_TILE_SIZE = 256


def _get_segmentation_annotation(annotation_id, user, require_edit=False):
    """Return annotation if it exists, is a segmentation type, and user has access."""
    annotation = get_object_or_404(Annotation, pk=annotation_id)
    if annotation.annotation_type.vector_type != AnnotationType.VECTOR_TYPE.SEGMENTATION:
        return None, HttpResponse('Annotation is not a segmentation type.', status=400)
    perm = 'edit_annotation' if require_edit else 'read'
    if not annotation.image.image_set.has_perm(perm, user):
        return None, HttpResponseForbidden()
    return annotation, None


def _seg_bytes_to_array(png_bytes):
    """Decode a stored PNG tile to a T×T uint8 binary array (0/1)."""
    from PIL import Image as PILImage
    import numpy as np
    T = _SEG_TILE_SIZE
    img = PILImage.open(io.BytesIO(bytes(png_bytes))).convert('L')
    return (np.array(img, dtype=np.uint8) > 127).astype(np.uint8)


def _array_to_png(arr):
    """Encode a T×T uint8 binary array to PNG bytes."""
    from PIL import Image as PILImage
    import numpy as np
    mask = (arr > 0).astype(np.uint8) * 255
    buf = io.BytesIO()
    PILImage.fromarray(mask, mode='L').save(buf, format='PNG')
    return buf.getvalue()


def _get_axial_tile(annotation_id, tx, ty, z):
    """Return T×T uint8 array for axial tile, or zeros if it does not exist."""
    import numpy as np
    T = _SEG_TILE_SIZE
    try:
        t = SegmentationTile.objects.get(
            annotation_id=annotation_id, level=0, tile_x=tx, tile_y=ty, frame=z)
        return _seg_bytes_to_array(t.data)
    except SegmentationTile.DoesNotExist:
        return np.zeros((T, T), dtype=np.uint8)


def _save_axial_tile(annotation_id, tx, ty, z, arr):
    """Persist a T×T uint8 array as an axial tile; delete if all-zero."""
    import numpy as np
    if not arr.any():
        SegmentationTile.objects.filter(
            annotation_id=annotation_id, level=0, tile_x=tx, tile_y=ty, frame=z).delete()
        return
    SegmentationTile.objects.update_or_create(
        annotation_id=annotation_id, level=0, tile_x=tx, tile_y=ty, frame=z,
        defaults={'data': _array_to_png(arr)})


def _z_vox_for_row(row_abs, nz, ph):
    """Map a physical pixel row in a non-axial plane to a z-voxel index.

    NIfTI renders with Superior at the top of the image, which means the
    first row (row=0) corresponds to the largest z index (z=nz-1).  The
    aspect-ratio-corrected physical height ph may differ from nz when
    through-plane spacing != in-plane spacing.
    """
    import numpy as np
    if ph <= 1:
        return int(np.clip(nz - 1 - row_abs, 0, nz - 1))
    return int(np.clip(nz - 1 - round(row_abs * (nz - 1) / (ph - 1)), 0, nz - 1))


def _y_vox_to_axial_row(y_vox, ny_vox, py):
    """Map an integer y-voxel index to the nearest axial image pixel row.

    For isotropic in-plane data (py == ny_vox) this is simply py-1-y_vox.
    For anisotropic data (e.g. a thick-slice MRI where sy >> sx) the axial
    image is upscaled in the y-direction: py > ny_vox, and the correct pixel
    row must account for the scaling factor sy/ref.
    """
    if ny_vox <= 1:
        return 0
    return round((ny_vox - 1 - y_vox) * (py - 1) / (ny_vox - 1))


def _build_coronal_tile(annotation_id, tx, ty, y_frame, ny, nz, ph, ny_vox=None):
    """Derive a coronal tile from stored axial tiles.

    Coordinate mapping (NIfTI radiological convention, isotropic in-plane):
      coronal col c  → axial col c  (same x-direction, both flipped the same way)
      coronal row r  → z-voxel: nz-1-round(r*(nz-1)/(ph-1))
      y_frame        → NIfTI y-voxel: y_frame+1 (OSD tile sources are 1-indexed)

    ny     = img.height = axial pixel height (may differ from ny_vox for anisotropic data)
    ny_vox = actual number of y-voxels (= coronal nFrames); defaults to ny for
             isotropic data where py == ny_vox.
    """
    import numpy as np
    T = _SEG_TILE_SIZE
    py = ny  # axial pixel height
    if ny_vox is None or ny_vox <= 0:
        ny_vox = py  # isotropic fallback: treat pixel height as voxel count

    # OSD tile sources use frame = page+1, so the displayed y-voxel is y_frame+1.
    y_vox = max(0, min(y_frame + 1, ny_vox - 1))
    # Map y_vox → axial image pixel row, accounting for possible y-axis upscaling.
    pixel_row = _y_vox_to_axial_row(y_vox, ny_vox, py)
    ax_ty = pixel_row // T
    ax_i  = pixel_row % T

    # One axial z per coronal row; batch-load unique z values.
    row_abs   = ty * T + np.arange(T)
    z_vox_arr = np.array([_z_vox_for_row(int(r), nz, ph) for r in row_abs])
    unique_z  = np.unique(z_vox_arr)

    tiles = SegmentationTile.objects.filter(
        annotation_id=annotation_id, level=0,
        tile_x=tx, tile_y=ax_ty, frame__in=unique_z.tolist())
    tile_map = {t.frame: _seg_bytes_to_array(t.data) for t in tiles}

    result = np.zeros((T, T), dtype=np.uint8)
    for r in range(T):
        z = int(z_vox_arr[r])
        if z in tile_map:
            result[r, :] = tile_map[z][ax_i, :]
    return result


def _write_coronal_tile(annotation_id, tx, ty, y_frame, ny, nz, ph, incoming, ny_vox=None):
    """Write a coronal tile's label data back into the canonical axial tiles."""
    import numpy as np
    T = _SEG_TILE_SIZE
    py = ny  # axial pixel height
    if ny_vox is None or ny_vox <= 0:
        ny_vox = py
    y_vox = max(0, min(y_frame + 1, ny_vox - 1))
    pixel_row = _y_vox_to_axial_row(y_vox, ny_vox, py)
    ax_ty = pixel_row // T
    ax_i  = pixel_row % T

    row_abs   = ty * T + np.arange(T)
    z_vox_arr = np.array([_z_vox_for_row(int(r), nz, ph) for r in row_abs])
    unique_z  = np.unique(z_vox_arr)

    tiles = SegmentationTile.objects.filter(
        annotation_id=annotation_id, level=0,
        tile_x=tx, tile_y=ax_ty, frame__in=unique_z.tolist())
    tile_map = {t.frame: _seg_bytes_to_array(t.data) for t in tiles}

    # Accumulate incoming rows per z (multiple coronal rows can share one z).
    z_data = {}
    for r in range(T):
        z = int(z_vox_arr[r])
        row = incoming[r, :]
        z_data[z] = np.maximum(z_data[z], row) if z in z_data else row.copy()

    for z, row_data in z_data.items():
        arr = tile_map.get(z, np.zeros((T, T), dtype=np.uint8)).copy()
        arr[ax_i, :] = row_data
        _save_axial_tile(annotation_id, tx, ax_ty, z, arr)


def _build_sagittal_tile(annotation_id, tx, ty, x_frame, nx, ny, nz, ph):
    """Derive a sagittal tile from stored axial tiles.

    Coordinate mapping (NIfTI radiological convention, isotropic in-plane):
      sagittal col c → y-voxel: ny-1-c  → axial row c  (in tile: c%T, ax_ty=c//T)
      sagittal row r → z-voxel: nz-1-round(r*(nz-1)/(ph-1))
      x_frame        → NIfTI x-voxel: x_frame+1 (OSD tile sources are 1-indexed)
    """
    import numpy as np
    T = _SEG_TILE_SIZE
    x_vox = max(0, min(x_frame + 1, nx - 1))
    ax_tx = (nx - 1 - x_vox) // T
    ax_j  = (nx - 1 - x_vox) % T
    # sagittal col c → ax_row=c → ax_ty=tx for c in [tx*T, (tx+1)*T)
    ax_ty = tx

    row_abs   = ty * T + np.arange(T)
    z_vox_arr = np.array([_z_vox_for_row(int(r), nz, ph) for r in row_abs])
    unique_z  = np.unique(z_vox_arr)

    tiles = SegmentationTile.objects.filter(
        annotation_id=annotation_id, level=0,
        tile_x=ax_tx, tile_y=ax_ty, frame__in=unique_z.tolist())
    tile_map = {t.frame: _seg_bytes_to_array(t.data) for t in tiles}

    result = np.zeros((T, T), dtype=np.uint8)
    for r in range(T):
        z = int(z_vox_arr[r])
        if z in tile_map:
            result[r, :] = tile_map[z][:, ax_j]
    return result


def _write_sagittal_tile(annotation_id, tx, ty, x_frame, nx, ny, nz, ph, incoming):
    """Write a sagittal tile's label data back into the canonical axial tiles."""
    import numpy as np
    T = _SEG_TILE_SIZE
    x_vox = max(0, min(x_frame + 1, nx - 1))
    ax_tx = (nx - 1 - x_vox) // T
    ax_j  = (nx - 1 - x_vox) % T
    ax_ty = tx

    row_abs   = ty * T + np.arange(T)
    z_vox_arr = np.array([_z_vox_for_row(int(r), nz, ph) for r in row_abs])
    unique_z  = np.unique(z_vox_arr)

    tiles = SegmentationTile.objects.filter(
        annotation_id=annotation_id, level=0,
        tile_x=ax_tx, tile_y=ax_ty, frame__in=unique_z.tolist())
    tile_map = {t.frame: _seg_bytes_to_array(t.data) for t in tiles}

    z_data = {}
    for r in range(T):
        z = int(z_vox_arr[r])
        col = incoming[r, :]  # 256 y-values for this row/z
        z_data[z] = np.maximum(z_data[z], col) if z in z_data else col.copy()

    for z, col_data in z_data.items():
        arr = tile_map.get(z, np.zeros((T, T), dtype=np.uint8)).copy()
        arr[:, ax_j] = col_data
        _save_axial_tile(annotation_id, ax_tx, ax_ty, z, arr)


@login_required
def segmentation_tile(request, annotation_id, level, tile_x, tile_y):
    """GET  → return tile PNG (204 if tile is empty)
       PUT  → store tile; non-axial planes write through to axial storage
       DELETE → remove axial tile (no-op for derived planes)

    `level` is the MPR plane index: 0=axial, 1=coronal, 2=sagittal.
    All labels are stored exclusively as axial (level=0) tiles; coronal and
    sagittal tiles are derived on-the-fly via coordinate remapping.

    For non-axial planes the client must pass `ph` (physical pixel height of
    the rendered plane image) so that the z-axis scaling can be applied.
    """
    import numpy as np
    from PIL import Image as PILImage

    frame  = int(request.GET.get('frame', 0))
    plane  = int(level)
    tile_x = int(tile_x)
    tile_y = int(tile_y)

    if request.method == 'GET':
        annotation, err = _get_segmentation_annotation(annotation_id, request.user)
        if err:
            return err

        if plane == 0:
            # Axial: direct lookup.
            try:
                tile = SegmentationTile.objects.get(
                    annotation_id=annotation_id,
                    level=0, tile_x=tile_x, tile_y=tile_y, frame=frame)
            except SegmentationTile.DoesNotExist:
                return HttpResponse(status=204)
            return HttpResponse(bytes(tile.data), content_type='image/png')

        # Coronal / sagittal: derive from axial tiles.
        img   = annotation.image
        nx, ny, nz = img.width, img.height, img.frames
        # ph = physical pixel height of the rendered plane; defaults to nz
        # (correct for isotropic data; client always sends the real value via &ph=).
        ph    = int(request.GET.get('ph', nz))
        # nf = number of slices along the normal axis of this plane (voxel count).
        # For coronal: ny_vox (may differ from ny=img.height when sy != sx).
        # Client sends &nf= from exactCurrentPlaneNFrames; 0 means not provided.
        nf    = int(request.GET.get('nf', 0))

        if plane == 1:
            arr = _build_coronal_tile(annotation_id, tile_x, tile_y, frame, ny, nz, ph,
                                      ny_vox=nf if nf > 0 else None)
        else:
            arr = _build_sagittal_tile(annotation_id, tile_x, tile_y, frame, nx, ny, nz, ph)

        if not arr.any():
            return HttpResponse(status=204)
        return HttpResponse(_array_to_png(arr), content_type='image/png')

    elif request.method == 'PUT':
        annotation, err = _get_segmentation_annotation(
            annotation_id, request.user, require_edit=True)
        if err:
            return err

        incoming_bytes = request.body
        if not incoming_bytes:
            return HttpResponse('Empty body.', status=400)

        try:
            incoming_img = PILImage.open(io.BytesIO(incoming_bytes)).convert('RGB')
        except Exception:
            return HttpResponse('Could not decode PNG.', status=400)

        # Threshold red channel at 127 → binary 0/1 array.
        incoming = (np.array(incoming_img, dtype=np.uint8)[:, :, 0] > 127).astype(np.uint8)

        if plane == 0:
            # Axial: store directly.
            mask = incoming * 255
            buf  = io.BytesIO()
            PILImage.fromarray(mask, mode='L').save(buf, format='PNG')
            SegmentationTile.objects.update_or_create(
                annotation_id=annotation_id,
                level=0, tile_x=tile_x, tile_y=tile_y, frame=frame,
                defaults={'data': buf.getvalue()})
            return HttpResponse(status=204)

        # Coronal / sagittal: write through to axial tiles.
        img   = annotation.image
        nx, ny, nz = img.width, img.height, img.frames
        ph    = int(request.GET.get('ph', nz))
        nf    = int(request.GET.get('nf', 0))

        if plane == 1:
            _write_coronal_tile(annotation_id, tile_x, tile_y, frame, ny, nz, ph, incoming,
                                ny_vox=nf if nf > 0 else None)
        else:
            _write_sagittal_tile(annotation_id, tile_x, tile_y, frame, nx, ny, nz, ph, incoming)
        return HttpResponse(status=204)

    elif request.method == 'DELETE':
        annotation, err = _get_segmentation_annotation(
            annotation_id, request.user, require_edit=True)
        if err:
            return err

        if plane == 0:
            SegmentationTile.objects.filter(
                annotation_id=annotation_id,
                level=0, tile_x=tile_x, tile_y=tile_y, frame=frame).delete()
        # Non-axial DELETE is a no-op: the data lives in axial tiles.
        return HttpResponse(status=204)

    return HttpResponse(status=405)
