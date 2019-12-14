from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.utils.translation import ugettext_lazy as _
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib import messages
from django.db import transaction
from django.core.files.storage import FileSystemStorage

from .forms import AnnotationTypeCreationForm, AnnotationTypeEditForm, ProductCreationForm, ProductEditForm
from imagetagger.annotations.models import Annotation, AnnotationType
from imagetagger.administration.models import Product
from imagetagger.users.models import Team


@staff_member_required
def products(request):
    teams = Team.objects.filter(members=request.user)
    return render(request, 'administration/product.html', {
        'products': Product.objects.filter(team__in=request.user.team_set.all()).order_by('team_id'),
        'create_form': ProductCreationForm,
        'teams': teams
    })

@staff_member_required
def product(request, product_id):
    selected_product = get_object_or_404(Product, id=product_id)
    return render(request, 'administration/product.html', {
        'products': Product.objects.filter(team__in=request.user.team_set.all()).order_by('team_id'),
        'product': selected_product,
        'create_form': ProductCreationForm,
        'edit_form': ProductEditForm(instance=selected_product),
        'teams': Team.objects.filter(members=request.user)
    })

@staff_member_required
def create_product(request):
    if request.method == 'POST':
        form = ProductCreationForm(request.POST)

        if form.is_valid():
            if Product.objects.filter(name=form.cleaned_data.get('name'), team=form.cleaned_data.get('team')).exists():
                form.add_error(
                    'name',
                    _('The name team combination is already in use by an product.'))
            else:
                with transaction.atomic():
                    form.instance.creator = request.user
                    product = form.save()

                messages.success(request, _('The product was created successfully.'))
                return redirect(reverse('administration:product', args=(product.id,)))
    else:
        return redirect(reverse('administration:product'))


@staff_member_required
def edit_product(request, product_id):
    selected_product = get_object_or_404(Product, id=product_id)
    if request.method == 'POST':
        if Product.objects.filter(name=request.POST['name'], team_id=request.POST['team']).exclude(id=selected_product.id).exists():
            messages.error(request, _('The name team combination is already in use by an product.'))
        else:
            selected_product.name = request.POST['name']
            selected_product.description = request.POST['description']
            selected_product.team = Team.objects.filter(id=request.POST['team']).first()

            selected_product.save()

            messages.success(request, _('The product was edited successfully.'))
    return redirect(reverse('administration:product', args=(product_id, )))

@staff_member_required
def annotation_types(request):
    form = AnnotationTypeCreationForm()
    form.fields['product'].queryset = Product.objects.filter(team__in=Team.objects.filter(members=request.user))

    teams = Team.objects.filter(members=request.user)
    return render(request, 'administration/annotation_type.html', {
        'annotation_types': AnnotationType.objects.filter(product__isnull=True).order_by('name'),
        'create_form': form,
        'teams': teams
    })


@staff_member_required
def annotation_type(request, annotation_type_id):
    creation_form = AnnotationTypeCreationForm()
    creation_form.fields['product'].queryset = Product.objects.filter(team__in=Team.objects.filter(members=request.user))

    selected_annotation_type = get_object_or_404(AnnotationType, id=annotation_type_id)

    edit_form = AnnotationTypeEditForm(instance=selected_annotation_type)
    edit_form.fields['product'].queryset = Product.objects.filter(team__in=Team.objects.filter(members=request.user))

    teams = Team.objects.filter(members=request.user)
    return render(request, 'administration/annotation_type.html', {
        'annotation_types': AnnotationType.objects.filter(product__isnull=True).order_by('name'),
        'annotation_type': selected_annotation_type,
        'vector_type_name': AnnotationType.get_vector_type_name(selected_annotation_type.vector_type),
        'create_form': creation_form,
        'edit_form': edit_form,
        'teams': teams
    })


@staff_member_required
def create_annotation_type(request):
    if request.method == 'POST':
        form = AnnotationTypeCreationForm(request.POST)

        if form.is_valid():
            if AnnotationType.objects.filter(name=form.cleaned_data.get('name'),
                                             product=form.cleaned_data.get('product')).exists():
                form.add_error(
                    'name',
                    _('The name is already in use by an annotation type.'))
            else:
                with transaction.atomic():

                    type = form.save()

                messages.success(request, _('The annotation type was created successfully.'))
                return redirect(reverse('administration:annotation_type', args=(type.id,)))
    else:
        return redirect(reverse('administration:annotation_types'))


@staff_member_required
def edit_annotation_type(request, annotation_type_id):
    selected_annotation_type = get_object_or_404(AnnotationType, id=annotation_type_id)
    if request.method == 'POST':
        if not request.POST['name'] == selected_annotation_type.name and AnnotationType.objects.filter(name=request.POST['name']).exists():
            messages.error(request, _('The name is already in use by an annotation type.'))
        else:
            selected_annotation_type.name = request.POST['name']
            selected_annotation_type.active = 'active' in request.POST
            selected_annotation_type.default_width = request.POST['default_width']
            selected_annotation_type.default_height = request.POST['default_height']
            selected_annotation_type.color_code = request.POST['color_code']
            selected_annotation_type.sort_order = request.POST['sort_order']
            selected_annotation_type.closed = 'closed' in request.POST
            selected_annotation_type.area_hit_test = 'area_hit_test' in request.POST
            selected_annotation_type.product = Product.objects.filter(id=request.POST['product']).first()

            if 'image_file' in request.FILES:
                file = request.FILES['image_file']
                fs = FileSystemStorage()
                filename = fs.save(file.name, file)

                selected_annotation_type.image_file = fs.url(filename)

            selected_annotation_type.save()

            messages.success(request, _('The annotation type was edited successfully.'))
    return redirect(reverse('administration:annotation_type', args=(annotation_type_id, )))


@staff_member_required
def migrate_bounding_box_to_0_polygon(request, annotation_type_id):
    selected_annotation_type = get_object_or_404(AnnotationType, id=annotation_type_id)

    if selected_annotation_type.vector_type is AnnotationType.VECTOR_TYPE.BOUNDING_BOX:
        annotations = Annotation.objects.filter(annotation_type=selected_annotation_type)
        for annotation in annotations:
            annotation.verifications.all().delete()
            if annotation.vector:
                annotation.vector = {
                    'x1': annotation.vector['x1'],
                    'y1': annotation.vector['y1'],
                    'x2': annotation.vector['x2'],
                    'y2': annotation.vector['y1'],
                    'x3': annotation.vector['x2'],
                    'y3': annotation.vector['y2'],
                    'x4': annotation.vector['x1'],
                    'y4': annotation.vector['y2'],
                }
            annotation.save()
        selected_annotation_type.vector_type = AnnotationType.VECTOR_TYPE.POLYGON
        selected_annotation_type.node_count = 0
        selected_annotation_type.save()
    return redirect(reverse('administration:annotation_type', args=(annotation_type_id, )))


@staff_member_required
def migrate_bounding_box_to_4_polygon(request, annotation_type_id):
    selected_annotation_type = get_object_or_404(AnnotationType, id=annotation_type_id)

    if selected_annotation_type.vector_type is AnnotationType.VECTOR_TYPE.BOUNDING_BOX:
        annotations = Annotation.objects.filter(annotation_type=selected_annotation_type)
        for annotation in annotations:
            annotation.verifications.all().delete()
            if annotation.vector:
                annotation.vector = {
                    'x1': annotation.vector['x1'],
                    'y1': annotation.vector['y1'],
                    'x2': annotation.vector['x2'],
                    'y2': annotation.vector['y1'],
                    'x3': annotation.vector['x2'],
                    'y3': annotation.vector['y2'],
                    'x4': annotation.vector['x1'],
                    'y4': annotation.vector['y2'],
                }
            annotation.save()
        selected_annotation_type.vector_type = AnnotationType.VECTOR_TYPE.POLYGON
        selected_annotation_type.node_count = 4
        selected_annotation_type.save()
    return redirect(reverse('administration:annotation_type', args=(annotation_type_id, )))
