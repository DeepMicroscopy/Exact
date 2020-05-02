from django.template.response import TemplateResponse
from django.core.paginator import Paginator
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.settings import api_settings
from rest_framework import viewsets, permissions
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from django.db.models import Q, F
from . import models
from . import serializers
import django_filters


class AnnotationFilterSet(django_filters.FilterSet):
    vector_x = django_filters.RangeFilter(method='get_vector_x_filter', field_name='vector', label="Vector-X-Range")
    vector_y = django_filters.RangeFilter(method='get_vector_y_filter', field_name='vector', label="Vector-Y-Range")
    
    class Meta:
       model = models.Annotation
       fields = {'vector_y': [], 'vector_x': [],        
        'id': ['exact'],
        'time': ['exact', 'lte', 'gte', 'range'],
        'unique_identifier': ['exact', 'contains'],
        'description': ['exact', 'contains'],
        'deleted': ['exact'],

        'image': ['exact'], #, 'range'
        'user': ['exact'],
        'annotation_type': ['exact'], #, 'range'
        'verified_by': ['exact', 'range'], #, 'range'
        'annotationversion': ['exact'],
       }

    def get_vector_x_filter(self, queryset, field_name, value):
        if value:
            queryset = queryset.exclude(vector__isnull=True)
            if value.start is not None:
                queryset.filter(vector__x1__gte=int(value.start))
            if  value.stop is not None:
                queryset = queryset.filter(vector__x1__lt=int(value.stop))
        return queryset
        

    def get_vector_y_filter(self, queryset, field_name, value):
        if value:
            queryset = queryset.exclude(vector__isnull=True)
            if value.start is not None:
                queryset.filter(vector__y__gte=int(value.start))
            if  value.stop is not None:
                queryset = queryset.filter(vector__y1__lt=int(value.stop))
        return queryset

class AnnotationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = serializers.AnnotationSerializer
    filterset_class = AnnotationFilterSet

    def get_queryset(self):
        user = self.request.user
        return  models.Annotation.objects.filter(image__image_set__team__in=user.team_set.all()).select_related('annotation_type', 'image', 'user', 'last_editor')

    def create(self, request):
        user = self.request.user
        if "user" not in request.data:
            request.data["user"] = user.id
        if "last_editor" not in request.data:
            request.data["last_editor"] = user.id
        response = super().create(request)
        return response

    def partial_update(self, request, *args, **kwargs):
        user = self.request.user
        if "last_editor" not in request.data:
            request.data["last_editor"] = user.id
        response = super().partial_update(request, *args, **kwargs)
        return response

    def update(self, request, *args, **kwargs):
        user = self.request.user
        if "last_editor" not in request.data:
            request.data["last_editor"] = user.id
        response = super().update(request, *args, **kwargs)
        return response

    def list(self, request, *args, **kwargs):
        if "api" in request.META['PATH_INFO']:
            return super(AnnotationViewSet, self).list(request, *args, **kwargs)
        else:
            annotations = self.filter_queryset(self.get_queryset()).order_by('image')

            current_query = request.META['QUERY_STRING']
            if "page" not in request.query_params:
                current_query += "&page=1"
                page_id = 1
            else:
                page_id = int(request.query_params.get('page', 1))
            
            limit = int(request.query_params.get('limit', api_settings.PAGE_SIZE))
           
            paginator = Paginator(annotations, limit)
            page = paginator.get_page(page_id)

            previous_query = first_query = current_query.replace("&page="+str(page_id), "&page=1")
            if page.has_previous():
                previous_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.previous_page_number()))
            
            next_query = last_query = current_query.replace("&page="+str(page_id), "&page={}".format(paginator.num_pages))
            if page.has_next():
                next_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.next_page_number()))

            return TemplateResponse(request, 'base/explore.html', {
                'mode': 'annotations',
                'annotations': page,  # to separate what kind of stuff is displayed in the view
                'paginator': page,  # for page stuff
                'first_query': first_query,
                'previous_query': previous_query,
                'next_query': next_query,
                'last_query': last_query,
                #'filter': self.filterset_class
            })

class AnnotationVersionFilterSet(django_filters.FilterSet):
    has_changes = django_filters.BooleanFilter(method='get_has_changes', field_name='has_changes', label="Has Changes")

    class Meta:
       model = models.AnnotationVersion
       fields = {
            'id': ['exact'],
            'version': ['exact'],
            'annotation': ['exact'],
            'image': ['exact'],

            'deleted': ['exact'],
            'annotation_type': ['exact'],
            'has_changes': ['exact'],
       }

    def get_has_changes(self, queryset, name, value):
        if value and value ==  True:
            queryset = queryset.filter(~Q(vector=F('annotation__vector')) | ~Q(annotation_type=F('annotation__annotation_type')) | ~Q(deleted=F('annotation__deleted'))).exclude(vector__isnull=True, annotation__vector__isnull=True)
        return queryset

class AnnotationVersionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = serializers.AnnotationVersionSerializer
    filterset_class = AnnotationVersionFilterSet

    def get_queryset(self):
        user = self.request.user
        return  models.AnnotationVersion.objects.filter(image__image_set__team__in=user.team_set.all()).select_related('annotation', 'image', 'annotation_type', 'version')

    def list(self, request, *args, **kwargs):
        if "api" in request.META['PATH_INFO']:
            return super(AnnotationVersionViewSet, self).list(request, *args, **kwargs)
        else:
            anno_versions = self.filter_queryset(self.get_queryset()).order_by('version')

            current_query = request.META['QUERY_STRING']
            if "page" not in request.query_params:
                current_query += "&page=1"
                page_id = 1
            else:
                page_id = int(request.query_params.get('page', 1))
            
            limit = int(request.query_params.get('limit', api_settings.PAGE_SIZE))
           
            paginator = Paginator(anno_versions, limit)
            page = paginator.get_page(page_id)

            previous_query = first_query = current_query.replace("&page="+str(page_id), "&page=1")
            if page.has_previous():
                previous_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.previous_page_number()))
            
            next_query = last_query = current_query.replace("&page="+str(page_id), "&page={}".format(paginator.num_pages))
            if page.has_next():
                next_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.next_page_number()))

            return TemplateResponse(request, 'base/explore.html', {
                'mode': 'annotation_versions',
                'annotation_versions': page,  # to separate what kind of stuff is displayed in the view
                'paginator': page,  # for page stuff
                'first_query': first_query,
                'previous_query': previous_query,
                'next_query': next_query,
                'last_query': last_query,
                #'filter': self.filterset_class
            })

class AnnotationTypeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.AnnotationType.objects.all().select_related('product')
    serializer_class = serializers.AnnotationTypeSerializer
    filterset_fields = {
       'id': ['exact'],
       'name': ['exact', 'contains'],
       'vector_type': ['exact', 'lte', 'gte', 'range'],
       'active': ['exact'],
       'product': ['exact'],
   }

    def get_queryset(self):
        user = self.request.user
        return  models.AnnotationType.objects.filter(product__team__in=user.team_set.all()).select_related('product')


    def list(self, request, *args, **kwargs):
        if "api" in request.META['PATH_INFO']:
            return super(AnnotationTypeViewSet, self).list(request, *args, **kwargs)
        else:
            annotation_types = self.filter_queryset(self.get_queryset()).order_by('product')
            
            current_query = request.META['QUERY_STRING']
            if "page" not in request.query_params:
                current_query += "&page=1"
                page_id = 1
            else:
                page_id = int(request.query_params.get('page', 1))            
            limit = int(request.query_params.get('limit', api_settings.PAGE_SIZE))

            paginator = Paginator(annotation_types, limit)
            page = paginator.get_page(page_id)


            previous_query = first_query = current_query.replace("&page="+str(page_id), "&page=1")
            if page.has_previous():
                previous_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.previous_page_number()))
            
            next_query = last_query = current_query.replace("&page="+str(page_id), "&page={}".format(paginator.num_pages))
            if page.has_next():
                next_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.next_page_number()))


            return TemplateResponse(request, 'base/explore.html', {
                'mode': 'annotation_types',
                'annotation_types': page,  # to separate what kind of stuff is displayed in the view
                'paginator': page,  # for page stuff
                'first_query': first_query,
                'previous_query': previous_query,
                'next_query': next_query,
                'last_query': last_query,
                #'filter': self.filterset_class
            })


class AnnotationMediaFileFilterSet(django_filters.FilterSet):
    MEDIA_FILE_TYPE_CHOICES = (
        (1, 'Undefined'),
        (2, 'Image'),
        (3, 'Video'),
        (4, 'Audio'),
    )

    media_file_type = django_filters.ChoiceFilter(choices=MEDIA_FILE_TYPE_CHOICES)

    class Meta:
        model = models.AnnotationMediaFile
        fields = {
            'id': ['exact'],
            'name': ['exact', 'contains'],
            'media_file_type': [],
            'annotation': ['exact'],
        }      

class AnnotationMediaFileViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = serializers.AnnotationMediaFileSerializer
    filterset_class = AnnotationMediaFileFilterSet

    def get_queryset(self):
        user = self.request.user
        return  models.AnnotationMediaFile.objects.filter(annotation__image__image_set__team__in=user.team_set.all()).select_related('annotation')  

    def create(self, request):
        media_file_type = int(request.POST.get('media_file_type', 0))
        annotation_id = int(request.POST.get('annotation', 0))        
        annotation = get_object_or_404(models.Annotation, id=annotation_id)

        media_files = []
        for f in list(request.FILES.values()):
            media_file = models.AnnotationMediaFile.objects.filter(name=f.name, annotation__id=annotation.id).first()

            if media_file is None:
                name = request.POST.get('name', f.name)
                media_file = models.AnnotationMediaFile(
                    name = f.name,
                    media_file_type = media_file_type,
                    annotation = annotation,
                    file = f
                )

                media_file.save()
                media_files.append(media_file)

        queryset = self.get_queryset().filter(id__in=[media_file.id for media_file in media_files])
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class VerificationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.Verification.objects.all().select_related('annotation', 'user')
    serializer_class = serializers.VerificationSerializer
    filterset_fields = {
        'id': ['exact'],
        'annotation': ['exact'],
        'user': ['exact'],       
        'time': ['exact', 'lte', 'gte', 'range'],
        'verified': ['exact'],  
   }

    def get_queryset(self):
        user = self.request.user
        return  models.Verification.objects.filter(annotation__image__image_set__team__in=user.team_set.all()).select_related('annotation', 'user')  


class LogImageActionFilterSet(django_filters.FilterSet):
    ACTION_CHOICES = (
        (1, 'OPEN'),
        (2, 'CLOSED'),
    )

    action = django_filters.ChoiceFilter(choices=ACTION_CHOICES)

    class Meta:
        model = models.LogImageAction
        fields = {
            'id': ['exact'],
            'image': ['exact'],
            'user': ['exact'],       
            'time': ['exact', 'lte', 'gte', 'range'],
            'action': [],  
            'ip': ['exact', 'contains'],  
        }

class LogImageActionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.LogImageAction.objects.all().select_related('image', 'user')
    serializer_class = serializers.LogImageActionSerializer
    filterset_class = LogImageActionFilterSet

    def get_queryset(self):
        user = self.request.user
        return  models.LogImageAction.objects.filter(image__image_set__team__in=user.team_set.all()).select_related('image', 'user')  
