from rest_framework.serializers import ModelSerializer

from exact.administration.models import Product
from exact.annotations.models import Annotation, AnnotationType
from rest_flex_fields import FlexFieldsModelSerializer
from typing import Dict, Any


class ProductSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = Product
        fields = (
            'id',
            'name',
            'description',
            'team',
            'creator',
            'imagesets',
            'annotationtype_set'
        )

        expandable_fields = {
            "team": ('exact.users.serializers.TeamSerializer', {'read_only': True}),
            "creator": ('exact.users.serializers.UserSerializer', {'read_only': True}),
            "imagesets": ('exact.images.serializers.ImageSetSerializer', {'read_only': True, 'many': True}),
            "annotationtype_set": ('exact.annotations.serializers.AnnotationTypeSerializer', {'read_only': True, 'many': True}),
        }

def serialize_annotationType(annotation_type: AnnotationType) -> Dict[str, Any]:
    return {
            'id': annotation_type.id,
            'closed': annotation_type.closed,
            'name': annotation_type.name,
            'vector_type': annotation_type.vector_type,
            'color_code': annotation_type.color_code,
            'multi_frame' : annotation_type.multi_frame,
            'area_hit_test' : annotation_type.area_hit_test
            
    }
