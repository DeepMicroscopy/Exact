from django.conf import settings
from django.utils.cache import patch_cache_control


def cache_in_browser(response):
    """
    Let the browser keep a response of image data (tiles, thumbnails) for settings.IMAGE_CACHE_MAX_AGE seconds.
    The content of a tile never changes for an image, so the browser does not have to ask again when the user pans
    back or opens the image another time. The responses are private: they require a login and must not be stored in
    shared caches.
    """
    max_age = getattr(settings, 'IMAGE_CACHE_MAX_AGE', 0)
    if max_age:
        patch_cache_control(response, private=True, max_age=max_age)
    return response
