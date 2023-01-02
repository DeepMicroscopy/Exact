from rest_flex_fields import FlexFieldsModelSerializer

from exact.processing.models import Plugin, PluginJob, PluginResultAnnotation, PluginResult, PluginResultEntry, PluginResultBitmap
from exact.images.serializers import ImageSerializer
from exact.users.serializers import UserSerializer
from exact.administration.serializers import ProductSerializer
from exact.annotations.serializers import AnnotationTypeSerializer

class PluginSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = Plugin
        fields = [
            'id',
            'name',
            'author',
            'contact', 
            'abouturl',
            'icon',
            'products',
            'results'
        ]

        expandable_fields = {
            "results": ('exact.processing.serializers.PluginResultSerializer', {'read_only': True, 'many': True}),
            "products": (ProductSerializer, {'read_only': True, 'many': True}),
        }

class PluginJobSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = PluginJob
        fields = (
            'id',
            'creator',
            'plugin',
            'created_time',
            'eta_time',
            'processing_complete',
            'updated_time',
            'result'
        )
        expandable_fields = {
            "creator": (UserSerializer, {'read_only': True}),
            "result": ('exact.processing.serializers.PluginResultSerializer', {'read_only':True})
        }

class PluginResultAnnotationSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = PluginResultAnnotation
        fields = (
            'id',
            'annotation_type',
            'pluginresultentry',
            'meta_data',
            'vector',
            'unique_identifier',
            'generated',
            'image',
            'time'
        )

        expandable_fields = {
            "pluginresultentry": ("exact.processing.serializers.PluginResultEntrySerializer",{'read_only': True}),
            "annotationtype": (AnnotationTypeSerializer, {'read_only':True, 'many': False}),
            "image": (ImageSerializer, {'read_only':True, 'many': False}),
        }

class PluginResultBitmapSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = PluginResultBitmap
        fields = (
            'id',
            'bitmap',
            'channels',
            'default_alpha',
            'default_threshold',
            'meta_data',
            'name',
            'scale_max',
            'scale_min',
            'transformation_matrix'
            'pluginresultentry',
            'image'
        )

        expandable_fields = {
            "pluginresultentry": ("exact.processing.serializers.PluginResultEntrySerializer",{'read_only': True}),
            "image": (ImageSerializer, {'read_only':True, 'many': False}),
        }

class PluginResultEntrySerializer(FlexFieldsModelSerializer):
    class Meta:
        model = PluginResultEntry
        fields = (
            'id',
            'pluginresult',
            'created_time',
            'name',
            'visible',
            'annotation_results',
            'bitmap_results'
        )

        expandable_fields = {
            "pluginresult": ("exact.processing.serializers.PluginResultSerializer",{'read_only': True}),
            "annotation_results": (PluginResultAnnotationSerializer, {'read_only':True, 'many': True}),
            "bitmap_results":(PluginResultBitmapSerializer, {'read_only':True, 'many': True})
        }

class PluginResultSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = PluginResult
        fields = (
            'id',
            'image',
            'job',
            'plugin',
            'completed_time',
            'created_time',
            'entries'
        )

        expandable_fields = {
            "image": (ImageSerializer, {'read_only': True, 'many': False}),
            "plugin": (PluginSerializer, {'read_only': True, 'many': False}),
            "job": (PluginJobSerializer, {'read_only': True, 'many': False}),
            "image": (ImageSerializer, {'read_only': True, 'many': False}),
            "entries": (PluginResultEntrySerializer, {'read_only': True, 'many': True}),
        }


