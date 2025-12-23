# administration/permissions.py
from functools import wraps
from django.http import HttpResponseForbidden
from django.shortcuts import redirect
from django.urls import reverse

def site_admin_required(view_func):
    """
    Allows access only to authenticated users with user.prefs.site_admin == True.
    Returns 403 for AJAX/JSON requests; redirects to login for anonymous users.
    """
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        user = request.user
        if not user.is_authenticated:
            # If you prefer 401 JSON instead, adjust here.
            return redirect(f"{reverse('login')}?next={request.path}")

        prefs = getattr(user, "prefs", None)
        if not prefs or not getattr(prefs, "is_site_admin", False):
            return HttpResponseForbidden("Site admin permission required.")
        return view_func(request, *args, **kwargs)

    return _wrapped
