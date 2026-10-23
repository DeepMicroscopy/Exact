"""Helpers to apply the scope restrictions of a PersonalAccessToken (see users.models)."""
from functools import wraps

from django.http import Http404
from rest_framework.response import Response

from .models import PersonalAccessToken


def token_team_ids(request):
    """Returns the ids of the teams the request is restricted to, or None if unrestricted."""
    pat = getattr(request, "auth", None)
    if not isinstance(pat, PersonalAccessToken):
        return None
    ids = getattr(pat, "_team_ids", None)
    if ids is None:
        ids = set(pat.teams.values_list("id", flat=True))
        pat._team_ids = ids
    return ids or None


def scope_queryset(request, queryset, lookup):
    """Restricts queryset to the token's teams; `lookup` is the path to the team
    (e.g. 'image__image_set__team', or 'team' for ImageSet itself)."""
    ids = token_team_ids(request)
    if ids is None:
        return queryset
    return queryset.filter(**{f"{lookup}__in": ids}).distinct()


def forbid_read_only_tokens(view):
    """
    For API views that change data although they are reached by GET requests: read-only tokens are refused.
    Has to be applied below @api_view so that the request is a rest framework request.
    """
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        pat = getattr(request, "auth", None)
        if isinstance(pat, PersonalAccessToken) and pat.read_only:
            return Response({"detail": "This token is read-only."}, status=403)
        return view(request, *args, **kwargs)
    return wrapper


def check_team(request, team_id):
    """Raises 404 if the token is not allowed to access the team's data."""
    ids = token_team_ids(request)
    if ids is not None and team_id not in ids:
        raise Http404
