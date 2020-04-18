from rest_framework import viewsets, permissions

from . import models
from . import serializers

class ProductViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    queryset = models.Product.objects.all()
    serializer_class = serializers.ProductSerializer 
    filterset_fields = {
       'id': ['exact'],
       'name': ['exact' , 'contains'],
       'description': ['exact', 'contains'],
       'team': ['exact'],
       'creator': ['exact'],
       'imagesets': ['exact'],
       'annotationtype': ['exact'], 
   }