from typing import Dict, Any
from rest_framework.serializers import ModelSerializer, SerializerMethodField
from rest_framework import serializers

from .models import Annotation, AnnotationType, Verification
from exact.images.serializers import ImageSerializer
from exact.administration.serializers import ProductSerializer


class AnnotationTypeSerializer(ModelSerializer):
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

    product = ProductSerializer(read_only=True)


class AnnotationSerializer(ModelSerializer):
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
            'user',
            'deleted',
            'description',
            'unique_identifier',
            'meta_data'
        )

    annotation_type = AnnotationTypeSerializer(read_only=True)
    image = ImageSerializer(read_only=True)

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
