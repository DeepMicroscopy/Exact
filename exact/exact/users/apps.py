from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'exact.users'

    def ready(self):
        from . import signals
        from django.contrib.auth import get_user_model

        class ScopedTeamSet:
            """
            Wraps the reverse accessor User.team_set: for users authenticated by a token that is restricted
            to some teams (user.token_team_ids), only these teams are returned.
            """

            def __init__(self, descriptor):
                self.descriptor = descriptor

            def __get__(self, instance, owner=None):
                manager = self.descriptor.__get__(instance, owner)
                team_ids = getattr(instance, 'token_team_ids', None) if instance is not None else None
                if team_ids is None:
                    return manager
                return manager.filter(id__in=team_ids)

            def __set__(self, instance, value):
                self.descriptor.__set__(instance, value)

            def __getattr__(self, name):
                return getattr(self.descriptor, name)

        User = get_user_model()
        if not isinstance(User.__dict__.get('team_set'), ScopedTeamSet):
            User.team_set = ScopedTeamSet(User.__dict__['team_set'])
        