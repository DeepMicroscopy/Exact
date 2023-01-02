from rest_framework import viewsets, permissions
from django.db.models import Q, Count
from django.db import transaction
from . import models
from . import serializers

class PluginJobViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PluginJobs to be viewed or edited.
    """
#    queryset = models.PluginJob.objects.all().order_by('-created_time')
    serializer_class = serializers.PluginJobSerializer
    permission_classes = [permissions.DjangoModelPermissions]
    def get_queryset(self):
        """
        This view should return a list of all the purchases for
        the user as determined by the username portion of the URL.
        """
        image_id = self.request.query_params.get('image_id')
        if image_id is not None:
            return models.PluginJob.objects.filter(image__id=image_id)
        else:
            return models.PluginJob.objects.all().order_by('-created_time')

class PluginViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Plugins to be viewed or edited.
    """
    queryset = models.Plugin.objects.all().order_by('-name')
    serializer_class = serializers.PluginSerializer
    permission_classes = [permissions.DjangoModelPermissions]


class PluginResultViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PluginResultss to be viewed or edited.
    """
    serializer_class = serializers.PluginResultSerializer
    permission_classes = [permissions.DjangoModelPermissions]

    def get_queryset(self):
        """
        This view should return a list of all the purchases for
        the user as determined by the username portion of the URL.
        """
        image_id = self.request.query_params.get('image_id')
        if image_id is not None:
            return models.PluginResult.objects.filter(image__id=image_id)
        else:
            return models.PluginResult.objects.all().order_by('-created_time')

class PluginResultEntryViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PluginResultsEntrys to be viewed or edited.
    """
    queryset = models.PluginResultEntry.objects.all().order_by('-created_time')
    serializer_class = serializers.PluginResultEntrySerializer
    permission_classes = [permissions.DjangoModelPermissions]

class PluginResultAnnotationViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PluginResultAnnotations to be viewed or edited.
    """
    serializer_class = serializers.PluginResultAnnotationSerializer
    permission_classes = [permissions.DjangoModelPermissions]
    def get_queryset(self):
        """
        This view should return a list of all the purchases for
        the user as determined by the username portion of the URL.
        """
        image_id = self.request.query_params.get('image')
        if image_id is not None:
            return models.PluginResultAnnotation.objects.filter(image__id=image_id)
        else:
            return models.PluginResultAnnotation.objects.all().order_by('-id')


class PluginResultBitmapViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PluginResultBitmaps to be viewed or edited.
    """
    queryset = models.PluginResultBitmap.objects.all().order_by('-id')
    serializer_class = serializers.PluginResultBitmapSerializer
    permission_classes = [permissions.DjangoModelPermissions]
