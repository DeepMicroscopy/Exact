from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib import messages
from django.db import transaction
from django.core.files.storage import FileSystemStorage
from django.core.paginator import Paginator
from django.contrib.auth.decorators import login_required

from exact.processing.models import Plugin
from exact.processing.serializers import PluginSerializer

from .forms import AnnotationTypeCreationForm, AnnotationTypeEditForm, ProductCreationForm, ProductEditForm
from exact.annotations.models import Annotation, AnnotationType
from exact.administration.models import Product
from exact.users.models import Team
from exact.images.models import ImageSet
from exact.administration.serializers import serialize_annotationType, ProductSerializer

from rest_framework.decorators import api_view
from rest_framework.exceptions import ParseError
from rest_framework.response import Response
from rest_framework.status import HTTP_201_CREATED, HTTP_400_BAD_REQUEST, HTTP_200_OK, \
    HTTP_403_FORBIDDEN
from django.conf import settings
import csv
import os
def logs(request):

    log=[]
    for handler in settings.LOGGING['loggers']['django']['handlers']:
        print(handler)
        if 'filename' in settings.LOGGING['handlers'][handler]:
            with open(settings.LOGGING['handlers'][handler]['filename']) as csv_file:
                csv_reader = csv.reader(csv_file, delimiter=';')
                line_count = 0
                for row in csv_reader:
                    if len(row)>5:
                        log.append([row[0],row[1],row[2],row[3],row[4],';'.join(row[5:])])
    log = reversed(log)
    teams = Team.objects.filter(members=request.user)
    return render(request, 'administration/log.html', {
        'products': Product.objects.filter(team__in=request.user.team_set.all()).order_by('team_id'),
        'create_form': ProductCreationForm,
        'log':log,
        'teams': teams
    })

def products(request):
    teams = Team.objects.filter(members=request.user)
    return render(request, 'administration/product.html', {
        'products': Product.objects.filter(team__in=request.user.team_set.all()).order_by('team_id'),
        'create_form': ProductCreationForm,
        'teams': teams
    })


def product(request, product_id):
    selected_product = get_object_or_404(Product, id=product_id)
    return render(request, 'administration/product.html', {
        'products': Product.objects.filter(team__in=request.user.team_set.all()).order_by('team_id'),
        'product': selected_product,
        'create_form': ProductCreationForm,
        'edit_form': ProductEditForm(instance=selected_product),
        'teams': Team.objects.filter(members=request.user)
    })



def create_product(request):


    if request.method == 'POST':
        form = ProductCreationForm(request.POST)

        if form.is_valid():
            if request.user.has_perm('administration.add_product') == False:
                messages.error(request, _('Missing rights to create products'))
            else:
                with transaction.atomic():
                    form.instance.creator = request.user
                    product = form.save()

                messages.success(request, _('The product was created successfully.'))

                if 'copy_product' in request.POST and int(request.POST['copy_product'])>0:
                    selected_product = get_object_or_404(Product, id=request.POST['copy_product'])
                    print('Copying from product: ', selected_product)
                    
                    for annoType in AnnotationType.objects.filter(product=selected_product.id):
                        annotationType = AnnotationType.objects.create(
                            name=annoType.name,
                            active=annoType.active,
                            node_count=annoType.node_count,
                            vector_type=annoType.vector_type,
                            color_code=annoType.color_code,
                            sort_order=annoType.sort_order,
                            enable_blurred=annoType.enable_blurred,
                            multi_frame=annoType.multi_frame,
                            default_height=annoType.default_height,
                            default_width=annoType.default_width,
                            closed=annoType.closed,
                            area_hit_test=annoType.area_hit_test,
                            product=product,
                        )
                        annotationType.save()


                return redirect(reverse('administration:product', args=(product.id,)))
        else:
            messages.error(request, _('The name team combination is already in use by an product.'))
        

            
    return redirect(reverse('administration:products'))


def edit_product(request, product_id):
    selected_product = get_object_or_404(Product, id=product_id)
    if request.method == 'POST':
        if Product.objects.filter(name=request.POST['name'], team_id=request.POST['team']).exclude(id=selected_product.id).exists():
            messages.error(request, _('The name team combination is already in use by an product.'))
        elif request.user.has_perm('administration.change_product') == False:
            messages.error(request, _('Missing rights to change a product'))
        else:
            selected_product.name = request.POST['name']
            selected_product.description = request.POST['description']
            selected_product.team = Team.objects.filter(id=request.POST['team']).first()

            selected_product.save()

            messages.success(request, _('The product was edited successfully.'))
    return redirect(reverse('administration:product', args=(product_id, )))


def annotation_types(request):
    form = AnnotationTypeCreationForm()
    form.fields['product'].queryset = Product.objects.filter(team__in=Team.objects.filter(members=request.user))

    teams = Team.objects.filter(members=request.user)
    return render(request, 'administration/annotation_type.html', {
        'annotation_types': AnnotationType.objects.filter(product__isnull=True).order_by('name'),
        'create_form': form,
        'teams': teams
    })


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

def plugins(request):

    teams = Team.objects.filter(members=request.user)
    all_products = Product.objects.filter(team__in=request.user.team_set.all()).order_by('name')
    print('All products:',all_products)
    return render(request, 'administration/plugins.html', {
        'plugins' : Plugin.objects.order_by('name'),
        'all_products' : all_products,
        'teams': teams
    })


def folder_size(path):
    """
    Calculates the size of a folder
    :param path: path to folder to analyze
    :return: size in GB of the folder
    """
    size = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.isfile(fp) and not os.path.islink(fp):
                size += os.path.getsize(fp)
    return round(size / (1024.0 * 1024.0 * 1024.0), 2)

def storage(request):

    teams = Team.objects.filter(members=request.user)
    #if (request.user.is_superuser):
    teams = Team.objects.all()

    for team in teams:
        imagesets = ImageSet.objects.filter(team=team).order_by('name')
        totalteam = 0
        for imageset in imagesets:
            filesize_gb = folder_size(imageset.root_path())
            imageset.storage_disk = '%.2f GB' % filesize_gb
            totalteam += filesize_gb
        team.storage_disk = '%.2f GB' % totalteam
        team.imagesets = imagesets
        

    return render(request, 'administration/storage.html', {
        'teams' : teams,
    })

@api_view(['POST'])
def add_plugin_product(request) -> Response:
    print('Running add product with:',request.data)
    try:
        plugin_id = int(request.data['plugin_id'])
        product_id = int(request.data['product_id'])
    except (KeyError, TypeError, ValueError):
        raise ParseError
    plugin = get_object_or_404(Plugin, pk=plugin_id)

    product = Product.objects.filter(id=product_id).first()

    plugin.products.add(product)
    plugin.save()

    serializer = ProductSerializer(product)


    return Response({
        'detail': 'added a product to the plugin.',
        'product': serializer.data,
        'plugin': PluginSerializer(plugin).data,
    }, status=HTTP_201_CREATED)

@login_required
@api_view(['DELETE'])
def remove_plugin_product(request) -> Response:
    print('Running delete product with:',request.data)
    try:
        plugin_id = int(request.data['plugin_id'])
        product_id = int(request.data['product_id'])
    except (KeyError, TypeError, ValueError):
        raise ParseError

    plugin = get_object_or_404(Plugin, pk=plugin_id)
    product = get_object_or_404(Product, id=product_id)



    plugin.products.remove(product)

    serializer = ProductSerializer(product)
    serializer_data = serializer.data

    product.save()

    return Response({
        'detail': 'removed the product.',
        'product': serializer_data,
        'plugin': PluginSerializer(plugin).data,
    }, status=HTTP_201_CREATED)

@api_view(['POST'])
def api_delete_annotation_type(request) -> Response:
    """
            Deleting of annotation types - only SUPERUSER!
    """
    try:
        annotation_type_id = request.data['annotation_type_id']
    except (KeyError, TypeError, ValueError):
        raise ParseError

    annotation_type = get_object_or_404(AnnotationType, pk=annotation_type_id)        

    number_of_annotations = Annotation.objects.filter(annotation_type=annotation_type).count()
    if not number_of_annotations==0:
        return Response({
            'detail': f'Annotation type is being used. Currently {number_of_annotations} annotations with this type.',
        }, status=HTTP_403_FORBIDDEN)

    if not request.user.is_superuser:
        return Response({
            'detail': 'permission for deleting the annotation type is missing.',
        }, status=HTTP_403_FORBIDDEN)

    annotation_type.delete()

    return Response({
        'detail': 'OK',
    }, status=HTTP_200_OK)    


@api_view(['POST'])
def api_create_product(request) -> Response:
    try:
        name = request.data['name']
        team = request.data['team']
        description = request.data.get('description', None)
    except (KeyError, TypeError, ValueError):
        raise ParseError

    team = get_object_or_404(Team, id=team['id'])
    product = Product.objects.filter(name=name, team__id=team['id']).first()
    if product is None:
        product = Product.objects.create(
            team = team,
            name = name,
            description = description
        )
        product.save()

    serializer = ProductSerializer(product)
    return Response(serializer.data, status=HTTP_201_CREATED)


@api_view(['GET'])
def api_filter_products(request) -> Response:
    try:
        name = request.QUERY_PARAMS.get('name', None)
        id = int(request.QUERY_PARAMS.get('id', -1))
        team = request.QUERY_PARAMS.get('team', None)
        limit = request.QUERY_PARAMS.get('limit', 50)
        offset = request.QUERY_PARAMS.get('offset', 50)

    except (KeyError, TypeError, ValueError):
        raise ParseError

    products = Product.objects.filter(team__in=request.user.team_set.all())
    if name is not None:
        products = products.filter(name=name)
    if id > 0:
        products = products.filter(id=id)
    if team is not None:
        products = products.filter(team__id=team['id'])
        
    serializer = ProductSerializer(products, many=True, context={'request': request})
    return Response(serializer.data, status=HTTP_200_OK)


@api_view(['POST'])
def api_create_annotation_type(request) -> Response:
    try:
         name = request.data['name']
         active = request.data.get('active',True)
         node_count = int(request.data.get('node_count',0))
         vector_type = request.data.get('vector_type')
         color_code = request.data.get('color_code', '#000000')
         sort_order = int(request.data.get('enable_concealed', 0))
         enable_blurred = request.data.get('enable_blurred', False)
         default_width = request.data.get('default_width', 50)
         default_height = request.data.get('default_height', 50)
         product_id = int(request.data.get('product_id',1))
         closed = request.data.get('closed', False)
         area_hit_test = request.data.get('area_hit_test', True)
         multi_frame = request.data.get('multi_frame', False)

    except (KeyError, TypeError, ValueError):
        raise ParseError

    product = get_object_or_404(Product, pk=product_id)
#    annotation_type = get_object_or_404(AnnotationType, pk=annotation_type_id)


    with transaction.atomic():
        annotationType = AnnotationType.objects.create(
            name=name,
            active=active,
            node_count=node_count,
            vector_type=vector_type,
            color_code=color_code,
            sort_order=sort_order,
            enable_blurred=enable_blurred,
            default_height=default_height,
            default_width=default_width,
            closed=closed,
            multi_frame=multi_frame,
            area_hit_test=area_hit_test,
            product=product,
        )

    return Response({
        'annotationType': serialize_annotationType(annotationType),
    }, status=HTTP_201_CREATED)


def create_annotation_type(request):
    if request.method == 'POST':
        form = AnnotationTypeCreationForm(request.POST)

        if form.is_valid():
            if request.user.has_perm('annotations.add_annotationtype') == False:
                messages.error(request, _('Missing rights to create annotation type'))
            else:
                with transaction.atomic():

                    type = form.save()

                messages.success(request, _('The annotation type was created successfully.'))
                return redirect(reverse('administration:annotation_type', args=(type.id,)))
        else:
            messages.error(request, _('The name is already in use by an annotation type.'))
    
    return redirect(reverse('administration:annotation_types'))


def delete_annotation_type(request, annotation_type_id):
    selected_annotation_type = get_object_or_404(AnnotationType, id=annotation_type_id)

    if request.method == 'GET':
        if request.user.has_perm('annotations.delete_annotationtype'):
            if selected_annotation_type.annotation_set.exists() == True:
                messages.error(request, _('A used annotation type can not be deleted.'))
            else:
                messages.success(request, _('The annotation type was deleted successfully.'))
                selected_annotation_type.delete()
                return redirect(reverse('administration:annotation_types'))
                
        else:
            messages.error(request, _('Missing rights to delete annotation type.'))


    return redirect(reverse('administration:annotation_type', args=(annotation_type_id, )))


def edit_annotation_type(request, annotation_type_id):
    selected_annotation_type = get_object_or_404(AnnotationType, id=annotation_type_id)
    if request.method == 'POST':
        if not request.POST['name'] == selected_annotation_type.name and AnnotationType.objects.filter(name=request.POST['name']).exists():
            messages.error(request, _('The name is already in use by an annotation type.'))
        elif request.user.has_perm('annotations.change_annotationtype') == False:
            messages.error(request, _('Missing rights to change annotation type'))
        else:
            selected_annotation_type.name = request.POST['name']
            selected_annotation_type.active = 'active' in request.POST
            selected_annotation_type.default_width = request.POST['default_width']
            selected_annotation_type.default_height = request.POST['default_height']
            selected_annotation_type.color_code = request.POST['color_code']
            selected_annotation_type.sort_order = request.POST['sort_order']
            selected_annotation_type.closed = 'closed' in request.POST
            selected_annotation_type.area_hit_test = 'area_hit_test' in request.POST
            selected_annotation_type.multi_frame = 'multi_frame' in request.POST
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
