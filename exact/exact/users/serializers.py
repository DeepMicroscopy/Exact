from rest_framework.serializers import ModelSerializer
from rest_flex_fields import FlexFieldsModelSerializer

from exact.users.models import Team, User, TeamMembership


class TeamSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = Team
        fields = [
            'id',
            'name',
            'members',
            'image_sets', 
            'product_set',
            'memberships'
        ]

        expandable_fields = {
            "members": ('exact.users.serializers.UserSerializer', {'read_only': True, 'many': True}),
            "image_sets": ('exact.images.ImageSetSerializer', {'read_only': True, 'many': True}),
            "product_set": ('exact.administration.ProductSerializer', {'read_only': True, 'many': True}),
            "memberships": ('exact.users.serializers.TeamMembershipSerializer', {'read_only': True, 'many': True}),
        }

class UserSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'is_superuser',
            'is_staff',
            'is_active',
            'last_login',
            'team_set'
        )

        expandable_fields = {
            "team_set": (TeamSerializer, {'read_only': True, 'many': True}),
        }


class TeamMembershipSerializer(FlexFieldsModelSerializer):
    class Meta:
        model = TeamMembership
        fields = (
            'id',
            'is_admin',
            'team',
            'user',
        )

        expandable_fields = {
            "team": (TeamSerializer, {'read_only': True}),
            "user": (UserSerializer, {'read_only': True}),
        }