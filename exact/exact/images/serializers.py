from rest_framework.serializers import ModelSerializer

from exact.images.models import ImageSet, Image, SetTag
from typing import Dict, Any

class ImageSerializer(ModelSerializer):
    class Meta:
        model = Image
        fields = (
            'id',
            'name',
            'height',
            'width',
            'mpp',
            'objectivePower'
        )


class SetTagSerializer(ModelSerializer):
    class Meta:
        model = SetTag
        fields = (
            'name',
        )


class ImageSetSerializer(ModelSerializer):
    class Meta:
        model = ImageSet
        fields = (
            'id',
            'name',
            'location',
            'description',
            'images',
            'main_annotation_type'
        )

    images = ImageSerializer(many=True)

def serialize_imageset(imageset: ImageSet) -> Dict[str, Any]:
    return {
        'id': imageset.id,
        'name': imageset.name,
        'location': imageset.location,
        'description': imageset.description,
        'team': {
            'id': imageset.team.id,
            'name': imageset.team.name
        },
        'images': [ {
            'id': image.id,
            'name': image.name
        } for image in imageset.images.all()
        ],
        'products' : 
        [ 
            {'name': product.name,
             'id' : product.id,
             'annotation_types': [{
                 'id': annotation_type.id,
                 'closed': annotation_type.closed,
                 'name': annotation_type.name,
                 'vector_type': annotation_type.vector_type,
                 'color_code': annotation_type.color_code,
                 'area_hit_test': annotation_type.area_hit_test
             } for annotation_type in product.annotationtype_set.all()]
             }
            for product in imageset.product_set.all()
        ],
        'main_annotation_type': 
        { 
            'id': imageset.main_annotation_type.id,
            'closed': imageset.main_annotation_type.closed,
            'name': imageset.main_annotation_type.name,
            'vector_type': imageset.main_annotation_type.vector_type,
            'color_code': imageset.main_annotation_type.color_code,
            'area_hit_test' : imageset.main_annotation_type.area_hit_test
        } if imageset.main_annotation_type is not None else None
    }