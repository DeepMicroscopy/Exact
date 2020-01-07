from rest_framework.serializers import ModelSerializer

from exact.administration.models import Product


class ProductSerializer(ModelSerializer):
    class Meta:
        model = Product
        fields = (
            'id',
            'name',
        )