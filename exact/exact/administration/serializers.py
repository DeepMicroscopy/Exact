from rest_framework.serializers import ModelSerializer

from exact.administration.models import Product
from exact.annotations.models import Annotation, AnnotationType
#from exact.annotations.serializers import AnnotationTypeSerializer
from typing import Dict, Any


class ProductSerializer(ModelSerializer):
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

def serialize_annotationType(annotation_type: AnnotationType) -> Dict[str, Any]:
    return {
            'id': annotation_type.id,
            'closed': annotation_type.closed,
            'name': annotation_type.name,
            'vector_type': annotation_type.vector_type,
            'color_code': annotation_type.color_code,
            'area_hit_test' : annotation_type.area_hit_test
    }
