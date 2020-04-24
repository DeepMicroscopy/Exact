from rest_framework import viewsets, permissions

from . import models
from . import serializers

class ProductViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
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

    def get_queryset(self):
        user = self.request.user
        return  models.Product.objects.filter(team__in=user.team_set.all()).select_related('creator', 'team')


    def create(self, request):
        user = self.request.user
        if "creator" not in request.data:
            request.data["creator"] = user.id
        response = super().create(request)
        return response