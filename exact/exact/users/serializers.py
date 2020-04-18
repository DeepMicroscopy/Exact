from rest_framework.serializers import ModelSerializer

from exact.users.models import Team, User, TeamMembership


class TeamSerializer(ModelSerializer):
    class Meta:
        model = Team
        fields = (
            'id',
            'name',
            'members'
        )

class UserSerializer(ModelSerializer):
    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'is_superuser',
            'is_staff',
            'is_active',
            'last_login',
        )


class TeamMembershipSerializer(ModelSerializer):
    class Meta:
        model = TeamMembership
        fields = (
            'id',
            'is_admin',
            'team',
            'user',
        )