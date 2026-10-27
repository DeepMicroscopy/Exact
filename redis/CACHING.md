# Caching

The EXACT server supports two types of caching in combination with all Django supported caching [technologies](https://docs.djangoproject.com/en/3.1/topics/cache/). 

## `Settings.py` or `Settings_base.py`

By default, EXACT uses the LocMemCache unique-snowflake, but please use a dedicated caching server for optimal performance.

Example for using [Redis](https://redis.io/) with Docker 
```python
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://redis:6379/1", # "redis://127.0.0.1:6379/1", 
        "OPTIONS": {
            "MAX_ENTRIES": 1000,
            "CLIENT_CLASS": "django_redis.client.DefaultClient", 
            "COMPRESSOR": "django_redis.compressors.zlib.ZlibCompressor",
        },
        "KEY_PREFIX": os.environ.get("SQL_DATABASE", default='exact')
    },
    "tiles_cache": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://redis:6379/1", # "redis://127.0.0.1:6379/1",
        "OPTIONS": {
            "MAX_ENTRIES": 100000,
            "CLIENT_CLASS": "django_redis.client.DefaultClient", 
            "COMPRESSOR": "django_redis.compressors.zlib.ZlibCompressor",
        },
        "KEY_PREFIX": os.environ.get("SQL_DATABASE", default='exact')
    },
}

# Read the sessions from the (shared) cache instead of the database for every request. Only use this with a cache
# that is shared by all server processes (like Redis), not with the default local memory cache.
SESSION_ENGINE = "django.contrib.sessions.backends.cached_db"
```

If the cache is configured with the environment variables (`CACHE_BACKEND`, `CACHE_LOCATION`, ...) instead of `settings.py`,
the sessions are read from the cache automatically as soon as the backend is not the local memory cache.

## Passiv caching

If caching is enabled in the settings.py, static resources like thumbnails and image tiles are cached and served from the cache.

## Active caching


Tiles and images can be cached manually by using the REST API.

```python
from exact_sync.v1.api.images_api import ImagesApi
from exact_sync.v1.configuration import Configuration
from exact_sync.v1.api_client import ApiClient

configuration = Configuration()
configuration.username = 'exact'
configuration.password = 'exact'
configuration.host = "http://127.0.0.1:8000"

client = ApiClient(configuration)
images_api = ImagesApi(client)

image_id=1
result = images_api.update_image_cache(id=image_id, mem_size_mb=20)
```

Syntax

```
{{baseUrl}}/api/v1/images/images/{id}/update_image_cache/

Body:
mem_size_mb: int default=5
z_dimension: int default=1
frame: int default=1
```