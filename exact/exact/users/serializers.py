from rest_framework.serializers import ModelSerializer
from rest_flex_fields import FlexFieldsModelSerializer

from exact.users.models import Team, User, TeamMembership


from rest_framework import serializers
from .models import PersonalAccessToken

class PersonalAccessTokenListSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonalAccessToken
        fields = ["id", "name", "prefix", "created_at", "last_used_at", "expires_at", "revoked_at",
                  "read_only", "image_sets"]

class PersonalAccessTokenCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    read_only = serializers.BooleanField(required=False, default=False)
    # Restrict the token to these image sets; omit or leave empty for access to all image sets.
    image_sets = serializers.ListField(child=serializers.IntegerField(), required=False, allow_empty=True)

    def validate_image_sets(self, ids):
        from exact.images.models import ImageSet
        user = self.context["request"].user
        allowed = set(ImageSet.objects.filter(id__in=ids, team__in=user.team_set.all()).values_list("id", flat=True))
        missing = set(ids) - allowed
        if missing:
            raise serializers.ValidationError(f"Unknown or inaccessible image sets: {sorted(missing)}")
        return sorted(allowed)

    
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