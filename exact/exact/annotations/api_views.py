from rest_framework import viewsets, permissions
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

    # def perform_create(self, serializer):

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
