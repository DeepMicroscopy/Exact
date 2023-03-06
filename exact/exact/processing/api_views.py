from rest_framework import viewsets, permissions
from django.db.models import Q, Count
from django.db import transaction
from . import models
import json
from . import serializers
from django.shortcuts import  get_object_or_404

class PluginJobViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PluginJobs to be viewed or edited.

    Filtering options (GET parameters):
    image_id: Only show plugin jobs for image with image.id==image_id
    incomplete: If true, only show incomplete jobs

    """
    serializer_class = serializers.PluginJobSerializer
    permission_classes = [permissions.DjangoModelPermissions]
    def get_queryset(self):
        """
        This view should return a list of all the purchases for
        the user as determined by the username portion of the URL.
        """
        image_id = self.request.query_params.get('image_id')
        user_id = self.request.query_params.get('user_id')
        filter_ids = self.request.query_params.get('filter_ids')
        o = models.PluginJob.objects
        if image_id is not None:
            o = o.filter(image__id=image_id)
        if user_id is not None:
            o = o.filter(creator__id=user_id)
        if filter_ids is not None:
            allowed_ids = json.loads('['+filter_ids+']')
            o = o.filter(id__in=allowed_ids)

        return o.order_by('-created_time')

class PluginViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows Plugins to be viewed or edited.
    """
    queryset = models.Plugin.objects.all().order_by('-name')
    serializer_class = serializers.PluginSerializer
    permission_classes = [permissions.DjangoModelPermissions]

    def get_queryset(self):
        """
        This view should return a list of all the purchases for
        the user as determined by the username portion of the URL.
        """
        imageset_from_image_id = self.request.query_params.get('imageset_from_image_id')

        if imageset_from_image_id is None:
            return models.Plugin.objects.all().order_by('-name')
        
        image = models.Image.objects.filter(id=imageset_from_image_id)

        #imageset = get_object_or_404(ImageSet, id=imageset_id)
        if (image.count()>0):
            return models.Plugin.objects.filter(products__in=image.first().image_set.product_set.all())
        else:
            return models.Plugin.objects.none()



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
        job_id = self.request.query_params.get('job_id')
        objects = models.PluginResult.objects.all()
        if image_id is not None:
            objects = objects.filter(image__id=image_id)
        if job_id is not None:
            objects = objects.filter(job__id=job_id)
        if job_id is not None:
            objects = objects.filter(job__id=job_id)
        
        return objects.order_by('-created_time')

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
        annotation_type = self.request.query_params.get('annotation_type')
        objects = models.PluginResultAnnotation.objects.all()
        if image_id is not None:
            objects = objects.filter(image__id=image_id)
        if annotation_type is not None:
            objects = objects.filter(annotation_type=annotation_type)
        return objects.order_by('-id')


class PluginResultBitmapViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows PluginResultBitmaps to be viewed or edited.
    """
    queryset = models.PluginResultBitmap.objects.all().order_by('-id')
    serializer_class = serializers.PluginResultBitmapSerializer
    permission_classes = [permissions.DjangoModelPermissions]
    def get_queryset(self):
        """
        This view should return a list of all the purchases for
        the user as determined by the username portion of the URL.
        """
        image_id = self.request.query_params.get('image')
        if image_id is not None:
            return models.PluginResultBitmap.objects.filter(image__id=image_id)
        else:
            return models.PluginResultBitmap.objects.all().order_by('-id')
