from django.core.cache import cache

_WINDOW = 15 * 60  # seconds


def active_user_tracking_middleware(get_response):
    """Stamp each authenticated request into the cache so active_users view
    can count recently-seen users without touching the database."""
    def middleware(request):
        response = get_response(request)
        if hasattr(request, 'user') and request.user.is_authenticated:
            cache.set(f'exact_user_seen_{request.user.pk}', request.user.username, _WINDOW)
        return response
    return middleware
