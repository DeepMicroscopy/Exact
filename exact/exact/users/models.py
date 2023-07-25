from typing import Set

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinLengthValidator, MaxLengthValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils.functional import cached_property
from django.dispatch import receiver
from django.db.models.signals import post_save


class User(AbstractUser):
    # points are updated by database triggers
    points = models.IntegerField(default=0)


class UI_User(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="ui")

    class Frontends(models.IntegerChoices):
            Default = 1
            Lightroom = 2

    frontend = models.IntegerField(choices=Frontends.choices, default=1)

    def __str__(self):
        return 'UI properties of user '+str(self.user)

# Add new users to teams if the ADD_USER_TO_TEAM is set
@receiver([post_save], sender=User)
def add_user_to_team_handler(sender, instance, **kwargs):
    if hasattr(settings, 'ADD_USER_TO_TEAM'):
        team_ids = settings.ADD_USER_TO_TEAM
        if isinstance(settings.ADD_USER_TO_TEAM, list) is False:
            team_ids = [settings.ADD_USER_TO_TEAM]

        for team in Team.objects.filter(pk__in=team_ids):
            if team is not None and team.members.filter(pk=instance.pk).exists() == False:
                team.memberships.create(user=instance)

    if hasattr(settings, 'ACTIVATE_USER_BY_DEFAULT'):
        if settings.ACTIVATE_USER_BY_DEFAULT and instance.is_active == False:
            instance.is_active = True
            instance.save()

class Team(models.Model):
    name = models.CharField(
        verbose_name=_('team name'),
        validators=[MinLengthValidator(3), MaxLengthValidator(30)],
        max_length=100, unique=True)

    members = models.ManyToManyField(settings.AUTH_USER_MODEL, through='TeamMembership')

    website = models.CharField(max_length=100, default='')

    def __str__(self):
        return u'Team: {0}'.format(self.name)

    @cached_property
    def admins(self) -> Set:
        return set(User.objects.filter(
            team_memberships__is_admin=True, team_memberships__team=self))

    def get_perms(self, user: User) -> Set[str]:
        """Get all permissions of the user."""
        perms = set()
        if self.is_admin(user):
            perms.update({
                'create_set',
                'user_management',
                'manage_export_formats',
            })
        if self.is_member(user):
            perms.update({
                'create_set',
                'manage_export_formats',
            })
        return perms

    def has_perm(self, permission: str, user: User) -> bool:
        """Check whether user has specified permission."""
        return permission in self.get_perms(user)

    def is_admin(self, user: User) -> bool:
        """Check whether user is admin of this group."""
        return user in self.admins

    def is_member(self, user: User) -> bool:
        """Check whether user is member of this group."""
        return self.members.filter(pk=user.pk).exists()


class TeamMembership(models.Model):
    """A membership of a team. Through model for field members of Team."""
    team = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='team_memberships')

    is_admin = models.BooleanField(default=False)

    def __str__(self) -> str:
        return '{}: {}'.format(self.team, self.user)
