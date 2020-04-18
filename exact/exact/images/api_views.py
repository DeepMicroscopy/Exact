from rest_framework import viewsets, permissions
from . import models
from . import serializers
import django_filters


class ImageFilterSet(django_filters.FilterSet):
    image_type = django_filters.ChoiceFilter(choices=models.Image.SOURCE_TYPES)

    class Meta:
        model = models.Image
        fields = {
            'id': ['exact'],
            'name': ['exact', 'contains'],
            'filename': ['exact', 'contains'],
            'time': ['exact', 'contains'],
            'mpp': ['exact', 'range'],
            'objectivePower': ['exact', 'range'],
            'width': ['exact', 'range'],
            'height': ['exact', 'range'],
            'image_type': [],
            'image_set': ['exact'],
        }

class ImageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    queryset = models.Image.objects.all().select_related('image_set')
    serializer_class = serializers.ImageSerializer
    filterset_class = ImageFilterSet


class ImageSetFilterSet(django_filters.FilterSet):
    collaboration_type = django_filters.ChoiceFilter(choices=models.ImageSet.COLLABORATION_TYPES)
    priority = django_filters.ChoiceFilter(choices=models.ImageSet.PRIORITIES)
    zip_state = django_filters.ChoiceFilter(choices=models.ImageSet.ZIP_STATES)
    #images = django_filters.AllValuesFilter(field_name='images', label='Images',method="get_query")
    images = django_filters.ModelChoiceFilter(queryset=models.Image.objects.all() ,method="get_query")

    class Meta:
        model = models.ImageSet
        fields = {
            'id': ['exact'],
            'path': ['exact', 'contains'],
            'name': ['exact', 'contains'],
            'location': ['exact', 'contains'],
            'description': ['exact', 'contains'],
            'time': ['exact', 'range'],
            'team': ['exact'],
            'creator': ['exact'],
            'public': ['exact'],
            'main_annotation_type': ['exact'],
            'images': [],
            'set_tags': ['exact'],
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
    queryset = models.ImageSet.objects.all().select_related('team', 'creator', 'main_annotation_type')
    serializer_class = serializers.ImageSetSerializer
    filterset_class = ImageSetFilterSet

class SetTagViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    queryset = models.SetTag.objects.all()
    serializer_class = serializers.SetTagSerializer
    filterset_fields = {
       'id': ['exact'],
       'name': ['exact', 'contains'],
   }

class ScreeningModeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    queryset = models.ScreeningMode.objects.all().select_related('image', 'user')
    serializer_class = serializers.ScreeningModeSerializer
    filterset_fields = {
       'id': ['exact'],
       'image': ['exact'],
       'user': ['exact'],
   }