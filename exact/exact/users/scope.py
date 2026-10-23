"""Helpers to apply the scope restrictions of a PersonalAccessToken (see users.models)."""
from django.http import Http404

from .models import PersonalAccessToken


def token_image_set_ids(request):
    """Returns the ids of the image sets the request is restricted to, or None if unrestricted."""
    pat = getattr(request, "auth", None)
    if not isinstance(pat, PersonalAccessToken):
        return None
    ids = getattr(pat, "_image_set_ids", None)
    if ids is None:
        ids = set(pat.image_sets.values_list("id", flat=True))
        pat._image_set_ids = ids
    return ids or None


def scope_queryset(request, queryset, lookup):
    """Restricts queryset to the token's image sets; `lookup` is the path to the image set id
    (e.g. 'image__image_set' or 'id' for ImageSet itself)."""
    ids = token_image_set_ids(request)
    if ids is None:
        return queryset
    return queryset.filter(**{f"{lookup}__in": ids}).distinct()


def check_image_set(request, image_set_id):
    """Raises 404 if the token is not allowed to access the image set."""
    ids = token_image_set_ids(request)
    if ids is not None and image_set_id not in ids:
        raise Http404
