from django.conf import settings
from django.shortcuts import redirect, render
from django.urls import reverse
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_403_FORBIDDEN
import time
from rest_framework.decorators import api_view
from rest_framework.decorators import authentication_classes, permission_classes

def index(request):
    return redirect(reverse('images:index'))

@api_view(['GET'])
@authentication_classes([])
@permission_classes([])
def report_time(request) -> Response:
    return Response({'unixtime': time.time()}, HTTP_200_OK)

@api_view(['GET'])
def active_users(request) -> Response:
    """Return count of users (excluding the requester) who made any request
    in the last 15 minutes.  Restricted to staff / site-admin users."""
    user = request.user
    is_admin = user.is_authenticated and (
        user.is_staff or
        (hasattr(user, 'prefs') and getattr(user.prefs, 'is_site_admin', False))
    )
    if not is_admin:
        return Response({'detail': 'Forbidden'}, HTTP_403_FORBIDDEN)

    from django.contrib.auth import get_user_model
    from django.core.cache import cache
    User = get_user_model()

    # The middleware stamps exact_user_seen_<pk> = True (TTL 15 min) on every
    # authenticated request, so we just count keys that are still alive.
    count = sum(
        1 for u in User.objects.filter(is_active=True).exclude(pk=user.pk)
        if cache.get(f'exact_user_seen_{u.pk}')
    )
    return Response({'active_users': count, 'window_minutes': 15}, HTTP_200_OK)


def problem_report(request):
    if settings.PROBLEMS_TEXT != '':
        return render(request, 'base/problem.html', {
            'text': settings.PROBLEMS_TEXT
        })
    else:
        return redirect(settings.PROBLEMS_URL)
