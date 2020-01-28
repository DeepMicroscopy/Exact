import datetime
import time;
import pytz

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.utils.translation import ugettext_lazy as _
from rest_framework.decorators import api_view
from rest_framework.exceptions import ParseError
from rest_framework.response import Response
from rest_framework.status import HTTP_201_CREATED, HTTP_400_BAD_REQUEST, HTTP_200_OK, \
    HTTP_403_FORBIDDEN

from exact.administration.models import Product
from exact.annotations.forms import ExportFormatCreationForm, ExportFormatEditForm
from exact.annotations.models import Annotation, AnnotationType, Export, \
    Verification, ExportFormat, LogImageAction
from exact.annotations.serializers import AnnotationSerializer, AnnotationTypeSerializer, \
    AnnotationSerializerFast, serialize_annotation
from exact.images.models import Image, ImageSet
from exact.users.models import Team


def export_auth(request, export_id):
    if request.user.is_authenticated():
        return HttpResponse('authenticated')
    return HttpResponseForbidden('authentication denied')


@login_required
def annotate(request, image_id):
    selected_image = get_object_or_404(Image, id=image_id)
    imageset_perms = selected_image.image_set.get_perms(request.user)
    if 'read' in imageset_perms:
        set_images = selected_image.image_set.images.all().order_by('name')
        annotation_types = AnnotationType.objects.filter(active=True,
                                                         product__in=selected_image.image_set.product_set.all())\
            .order_by('sort_order')  # for the dropdown option

        total_annotations = selected_image.annotations.filter(deleted=False).count()
        imageset_lock = selected_image.image_set.image_lock
        return render(request, 'annotations/annotate.html', {
            'selected_image': selected_image,
            'imageset_perms': imageset_perms,
            'imageset_lock': imageset_lock,
            'set_images': set_images,
            'total_annotations': total_annotations,
            'annotation_types': annotation_types,
        })
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
                            #CRUD Infos
                            '%%first_editor': annotation.user.username,
                            '%%first_timepoint': annotation.time,
                            '%%first_editor': annotation.last_editor.username,
                            '%%last_timepoint': annotation.last_edit_time,
                            '%%UUID': annotation.unique_identifier,
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
                            .replace(key, str(value))
                    annotation_content += formatted_annotation + '\n'

                formatted_image = export_format.image_format
                placeholders_image = {
                    '%%imageset': imageset.name,
                    '%%imagewidth': image.width,
                    '%%imageheight': image.height,
                    '%%imagename': image.name,
                    '%%annotations': annotation_content,
                    '%%annoamount': annotations.count(),
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
                    #CRUD Infos
                    '%%first_editor': annotation.user.username,
                    '%%first_timepoint': annotation.time,
                    '%%last_editor': annotation.last_editor.username,
                    '%%last_timepoint': annotation.last_edit_time,
                    '%%UUID': annotation.unique_identifier,
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
                formatted_annotation = formatted_annotation.replace(key, str(value))
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


@login_required
@api_view(['DELETE'])
def api_delete_annotation(request) -> Response:
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


@login_required
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







@login_required
@api_view(['POST'])
def create_annotation(request) -> Response:
    try:
        image_id = int(request.data['image_id'])
        annotation_type_id = int(request.data['annotation_type_id'])
        vector = request.data['vector']
        blurred = request.data.get('blurred', False)
        concealed = request.data.get('concealed', False)
        tempid = request.data.get('tempid', False)
        description = request.data.get('description', "")
    except (KeyError, TypeError, ValueError):
        raise ParseError

    image = get_object_or_404(Image, pk=image_id)
    annotation_type = get_object_or_404(AnnotationType, pk=annotation_type_id)

    if not image.image_set.has_perm('annotate', request.user):
        return Response({
            'detail': 'permission for annotating in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)


    with transaction.atomic():
        annotation = Annotation.objects.create(
            vector=vector,
            image=image,
            annotation_type=annotation_type,
            user=request.user,
            last_editor=request.user,
            _blurred=blurred,
            _concealed=concealed,
            description=description
        )

        if "unique_identifier" in request.data:
            annotation.unique_identifier = request.data["unique_identifier"]

        # Automatically verify for owner
        annotation.verify(request.user, True)

    return Response({
        'annotations': serialize_annotation(annotation),
        'tempid': tempid
    }, status=HTTP_201_CREATED)


#@login_required
@api_view(['GET'])
def load_annotations(request) -> Response:
    try:
        image_id = int(request.query_params['image_id'])
        since = request.query_params.get('since', None)
        min_x = request.query_params.get('min_x', None)
        max_x = request.query_params.get('max_x', None)
        min_y = request.query_params.get('min_y', None)
        max_y = request.query_params.get('max_y', None)
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


@login_required
@api_view(['GET'])
def load_annotation_types(request) -> Response:

    annotation_types = None
    if 'imageset_id' in request.query_params:
        imageset_id = int(request.query_params['imageset_id'])
        imageset = get_object_or_404(ImageSet, pk=imageset_id)
        annotation_types = AnnotationType.objects.filter(active=True,
                                                         product__in=imageset.product_set.all())\
            .order_by('sort_order')
    else:
        annotation_types = AnnotationType.objects.filter(active=True).order_by('sort_order')


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




@login_required
@api_view(['POST'])
def update_annotation(request) -> Response:
    try:
        annotation_id = int(request.data['annotation_id'])
        image_id = int(request.data['image_id'])
        annotation_type_id = int(request.data['annotation_type_id'])
        vector = request.data['vector']
        blurred = request.data.get('blurred', False)
        concealed = request.data.get('concealed', False)
        deleted = bool(request.data.get('deleted', False))
        description = request.data.get('description', "")
    except (KeyError, TypeError, ValueError):
        raise ParseError

    if "unique_identifier" in request.data:
        annotation = get_object_or_404(Annotation, image__id=image_id,
                                       unique_identifier=request.data["unique_identifier"])
    else:
        annotation = get_object_or_404(Annotation, pk=annotation_id)

    annotation_type = get_object_or_404(AnnotationType, pk=annotation_type_id)

    if annotation.image_id != image_id:
        raise ParseError('the image id does not match the annotation id.')

    if not annotation.image.image_set.has_perm('edit_annotation', request.user):
        return Response({
            'detail': 'permission for updating annotations in this image set missing.',
        }, status=HTTP_403_FORBIDDEN)


    with transaction.atomic():
        annotation.annotation_type = annotation_type
        annotation.vector = vector
        annotation._concealed = concealed
        annotation._blurred = blurred
        annotation.last_editor = request.user
        annotation.annotation_type = annotation_type
        annotation.deleted = deleted
        annotation.description = description
        annotation.save()


        # Automatically verify for owner
        annotation.verify(request.user, True)

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
