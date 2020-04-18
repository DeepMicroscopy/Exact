from rest_framework import viewsets, permissions
from . import models
from . import serializers


class UserViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    queryset = models.User.objects.all()
    serializer_class = serializers.UserSerializer
    filterset_fields = {
       'id': ['exact'],
       'username': ['exact', 'contains'],
       'is_superuser': ['exact'],
       'is_staff': ['exact'],
       'is_active': ['exact'],
       'last_login': ['exact'],
       'team': ['exact'],
   }

class TeamViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    queryset = models.Team.objects.all()
    serializer_class = serializers.TeamSerializer
    filterset_fields = {
       'id': ['exact'],
       'name': ['exact', 'contains'],
       'members': ['exact'],
   }

    
class TeamMembershipViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    queryset = models.TeamMembership.objects.all().select_related('team', 'user')
    serializer_class = serializers.TeamMembershipSerializer
    filterset_fields = {
       'id': ['exact'],
       'is_admin': ['exact'],
       'team': ['exact'],
       'user': ['exact'],
   }