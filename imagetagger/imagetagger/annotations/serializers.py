from typing import Dict, Any
from rest_framework.serializers import ModelSerializer, SerializerMethodField
from rest_framework import serializers

from .models import Annotation, AnnotationType, Verification
from imagetagger.images.serializers import ImageSerializer


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
            'closed'
        )


class AnnotationSerializer(ModelSerializer):
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
            'last_editor',
            'user',
            'deleted',
            'description'
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
            'description'
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
        'annotation_type': {
            'id': anno.annotation_type.id,
            'closed': anno.annotation_type.closed,
            'name': anno.annotation_type.name,
            'vector_type': anno.annotation_type.vector_type,
            'color_code': anno.annotation_type.color_code,
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
    }


class AnnotationSerializerCustom(serializers.Serializer):
    id = serializers.IntegerField()
    concealed = serializers.BooleanField()
    blurred = serializers.BooleanField()
    vector = serializers.JSONField()
    #annotation_type =