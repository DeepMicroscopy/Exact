from rest_framework import viewsets, permissions
from django.db.models import Q, Count
from django.db import transaction
from . import models
from . import serializers


class UserViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.User.objects.all()
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

    def get_queryset(self):
        user = self.request.user
        return  models.User.objects.filter(team__in=user.team_set.all()).distinct()

class TeamViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.Team.objects.all()
    serializer_class = serializers.TeamSerializer
    filterset_fields = {
       'id': ['exact'],
       'name': ['exact', 'contains'],
       'members': ['exact'],
       'image_sets': ['exact'],
    }

    def get_queryset(self):
        user = self.request.user
        return models.Team.objects.filter(id__in=user.team_set.all())

    def create(self, request):
        user = self.request.user
        response = super().create(request)
        # add team creator as admin
        with transaction.atomic():
            team = models.Team.objects.filter(id=response.data['id']).first()
            if models.TeamMembership.objects.filter(team=team, user=user).first() == None:
                models.TeamMembership.objects.create(user=user, team=team, is_admin=True)
        return response

    
class TeamMembershipViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    #queryset = models.TeamMembership.objects.all().select_related('team', 'user')
    serializer_class = serializers.TeamMembershipSerializer
    filterset_fields = {
       'id': ['exact'],
       'is_admin': ['exact'],
       'team': ['exact'],
       'user': ['exact'],
    }

    def get_queryset(self):
        user = self.request.user
        return models.TeamMembership.objects.filter(team__in=user.team_set.all()).select_related('team', 'user')