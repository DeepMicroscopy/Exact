from typing import Dict, Any
from rest_framework.serializers import ModelSerializer, SerializerMethodField
from rest_framework import serializers
from rest_flex_fields import FlexFieldsModelSerializer

from .models import Annotation, AnnotationType, Verification, LogImageAction, AnnotationMediaFile, AnnotationVersion
from exact.images.serializers import ImageSerializer, SetVersionSerializer
from exact.administration.serializers import ProductSerializer
from exact.users.serializers import UserSerializer

class AnnotationVersionSerializer(FlexFieldsModelSerializer):
    has_changes = serializers.BooleanField()

    class Meta:
        model = AnnotationVersion
        fields = (
            'id',
            'version',
            'annotation',
            'image',
            'annotation_type',
            'deleted',
            'vector',
            'has_changes'
        )

        expandable_fields = {
            'version': (SetVersionSerializer, {'read_only': True}),
            'annotation': ('AnnotationSerializer', {'read_only': True}),
            "annotation_type": ('AnnotationTypeSerializer', {'read_only': True}),
            "image": (ImageSerializer, {'read_only': True}),
        }

class AnnotationTypeSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = AnnotationType
        fields = (
            'id',
            'name',
            'vector_type',
            'node_count',
            'enable_concealed',
            'enable_blurred',
            'color_code',
            'default_width',
            'default_height',
            'sort_order',
            'closed',
            'area_hit_test',
            'product'
        )

        expandable_fields = {
            "product": (ProductSerializer, {'read_only': True}),
        }

class AnnotationSerializer(FlexFieldsModelSerializer):
    verified_by_user = SerializerMethodField('is_verified_by_user')
    is_verified = SerializerMethodField('is_verified')

    def is_verified(self, annotation):

        return Verification.objects.filter(annotation=annotation, verified=True).exists()

    def is_verified_by_user(self, annotation):

        user = self.context['request'].user
        return Verification.objects.filter(user=user, annotation=annotation, verified=True).exists()

    class Meta:
        model = Annotation
        fields = (
            'annotation_type',
            'id',
            'vector',
            'verified_by_user',
            'image',
            'concealed',
            'blurred',
            'last_editor',
            'last_edit_time',
            'user',
            'time',
            'deleted',
            'description',
            'unique_identifier',
            'uploaded_media_files',
            'meta_data',
            'annotationversion_set'
        )

        expandable_fields = {
            "annotationversion_set": ('exact.annotations.serializers.AnnotationVersionSerializer', {'read_only': True, 'many': True}),
            "uploaded_media_files": ('exact.annotations.serializers.AnnotationMediaFileSerializer', {'read_only': True, 'many': True}),
            "annotation_type": (AnnotationTypeSerializer, {'read_only': True}),
            "image": (ImageSerializer, {'read_only': True}),
            "user": (UserSerializer, {'read_only': True}),
            "last_editor": (UserSerializer, {'read_only': True}),
        }

class VerificationSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = Verification
        fields = (
            'id',
            'annotation',
            'user',
            'time',
            'verified',
        )

        expandable_fields = {
            "annotation": (AnnotationSerializer, {'read_only': True}),
            "user": (UserSerializer, {'read_only': True}),
        }

class LogImageActionSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = LogImageAction
        fields = (
            'id',
            'image',
            'user',
            'time',
            'action',
            'ip',
        )

        expandable_fields = {
            "image": (ImageSerializer, {'read_only': True}),
            "user": (UserSerializer, {'read_only': True}),
        }

class AnnotationMediaFileSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = AnnotationMediaFile
        fields = (
            'id',
            'name',
            'media_file_type',
            'file',
            'annotation'
        )

        expandable_fields = {
            "annotation": (AnnotationSerializer, {'read_only': True}),
        }

class AnnotationSerializerFast(ModelSerializer):
    verified_by_user = SerializerMethodField('is_verified_by_user')

    def is_verified_by_user(self, annotation):

        user = self.context['request'].user
        return Verification.objects.filter(user=user, annotation=annotation).exists()

    class Meta:
        model = Annotation
        fields = (
            'annotation_type',
            'id',
            'vector',
            'verified_by_user',
            'image',
            'concealed',
            'blurred',
            'deleted',
            'description',
            'unique_identifier',
            'meta_data'
        )
        read_only_fields = fields

    annotation_type = AnnotationTypeSerializer(read_only=True)
    image = ImageSerializer(read_only=True)

def serialize_annotation(anno: Annotation) -> Dict[str, Any]:
    return {
        'id': anno.id,
        'vector': anno.vector,
        'last_edit_time': anno.last_edit_time,
        'deleted': anno.deleted,
        'description': anno.description,
        'unique_identifier': anno.unique_identifier,
        'annotation_type': {
            'id': anno.annotation_type.id,
            'closed': anno.annotation_type.closed,
            'name': anno.annotation_type.name,
            'vector_type': anno.annotation_type.vector_type,
            'color_code': anno.annotation_type.color_code,
            'area_hit_test' : anno.annotation_type.area_hit_test
        },
        'media_files':
            [
                {
                    'name': file.name,
                    'id': file.id,
                    'file': file.file.url,
                    'media_file_type': file.media_file_type
                 }
                for file in anno.uploaded_media_files.all()
            ],
        'image': {
            'id': anno.image.id,
            'name': anno.image.name
        },
        'last_editor': {
            'id': anno.last_editor.id if anno.last_editor is not None else anno.user.id,
            'name': anno.last_editor.username if anno.last_editor is not None else anno.user.username
        },
        'first_editor': {
            'id': anno.user.id,
            'name': anno.user.username
        },
        'is_verified': Verification.objects.filter(annotation=anno, verified=True).exists(),
        'meta_data': anno.meta_data
    }
