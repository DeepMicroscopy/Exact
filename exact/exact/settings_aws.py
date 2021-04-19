import logging
from .settings_base import *
import os
import json
import redis


# These will be injected by ECS from our AWS Secrets Manager!
DJANGO_ECS_SECRETS = json.loads(os.environ.get("DJANGO_ECS_SECRETS"))

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = DJANGO_ECS_SECRETS['DJANGO_SECRET_KEY']

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG =  int(os.environ.get("DEBUG", default=0))

# Allowed Host headers this site can server
ALLOWED_HOSTS = ['*', 'exact-annotations.de']

# Database
# https://docs.djangoproject.com/en/3.0/ref/settings/#databases
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql_psycopg2',
        'NAME': DJANGO_ECS_SECRETS['POSTGRES_DB'],
        'USER': DJANGO_ECS_SECRETS['POSTGRES_USER'],
        'PASSWORD': DJANGO_ECS_SECRETS['POSTGRES_PASSWORD'],
        'HOST': DJANGO_ECS_SECRETS['POSTGRES_HOST'],
        'PORT': DJANGO_ECS_SECRETS['POSTGRES_PORT']
     }
}

DATABASES["default"]["ATOMIC_REQUESTS"] = True  # noqa F405
DATABASES["default"]["CONN_MAX_AGE"] = int(os.environ.get("CONN_MAX_AGE", default=60))  # noqa F405

# SECURITY
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#secure-proxy-ssl-header
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# https://docs.djangoproject.com/en/dev/ref/settings/#session-cookie-secure
SESSION_COOKIE_SECURE = True
# https://docs.djangoproject.com/en/dev/ref/settings/#csrf-cookie-secure
CSRF_COOKIE_SECURE = True
# https://docs.djangoproject.com/en/dev/topics/security/#ssl-https
# https://docs.djangoproject.com/en/dev/ref/settings/#secure-hsts-seconds
# TODO: set this to 60 seconds first and then to 518400 once you prove the former works
SECURE_HSTS_SECONDS = 60
# https://docs.djangoproject.com/en/dev/ref/settings/#secure-hsts-include-subdomains
SECURE_HSTS_INCLUDE_SUBDOMAINS = bool(os.environ.get(
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", default=True
))
# https://docs.djangoproject.com/en/dev/ref/settings/#secure-hsts-preload
SECURE_HSTS_PRELOAD = bool(os.environ.get("DJANGO_SECURE_HSTS_PRELOAD", default=True))
# https://docs.djangoproject.com/en/dev/ref/middleware/#x-content-type-options-nosniff
SECURE_CONTENT_TYPE_NOSNIFF = bool(os.environ.get(
    "DJANGO_SECURE_CONTENT_TYPE_NOSNIFF", default=True
))

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname};{asctime};{module};{process:d};{thread:d};{message}',
            'style': '{',
        },
    },
	'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console'], # include   to start logging to file
            'level': 'INFO',
            'propagate': True,
        },
    },
}

#Caching settings
DJANGO_REDIS_IGNORE_EXCEPTIONS = True

_redis_host = os.environ['REDIS_HOST']
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": f"redis://{_redis_host}:6379/0", # "redis://127.0.0.1:6379/1", #"redis://redis:6379/0"
        "OPTIONS": {
            "MAX_ENTRIES": 10000,
            "CLIENT_CLASS": "django_redis.client.DefaultClient", 
            "COMPRESSOR": "django_redis.compressors.zlib.ZlibCompressor",
        },
        "KEY_PREFIX": os.environ.get("SQL_DATABASE", default='exact')
    },
    "tiles_cache": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": f"redis://{_redis_host}:6379/1", # "redis://127.0.0.1:6379/1", #"redis://redis:6379/0"
        "OPTIONS": {
            "MAX_ENTRIES": 1000000,
            "CLIENT_CLASS": "django_redis.client.DefaultClient", 
            "COMPRESSOR": "django_redis.compressors.zlib.ZlibCompressor",
        },
        "KEY_PREFIX": os.environ.get("SQL_DATABASE", default='exact')
    },
}

try:
    logger = logging.getLogger('django')
    r = redis.Redis(host=_redis_host, port=6379, db=1)
    pong = r.ping()
    logger.info(f"Ping; {pong}")
except Exception:
    logger.error("Unable to connect to Redis", exc_info=True)

# Internationalization
# https://docs.djangoproject.com/en/1.10/topics/i18n/

LANGUAGE_CODE = 'en-us'

SHOW_DEMO_DATASETS = False

# TIME_ZONE = 'Europe/Berlin' #Timezone of your server

# STATIC_URL = '/static/'

# EXPORT_SEPARATOR = '|'
# DATA_PATH = os.path.join(BASE_DIR, 'data')

#IMAGE_PATH = os.path.join(BASE_DIR, 'images')  # the absolute path to the folder with the imagesets

# filename extension of accepted imagefiles
# IMAGE_EXTENSION = {
#     'png',
#     'jpg',
# }

USE_NGINX_IMAGE_PROVISION = False  # defines if images get provided directly via nginx what generally improves imageset download performance

# The 'report a problem' page on an internal server error can either be a custom url or a text that can be defined here.
# PROBLEMS_URL = 'https://problems.example.com'
# PROBLEMS_TEXT = 'To report a problem, contact admin@example.com'

USE_IMPRINT = False
IMPRINT_NAME = ''
IMPRINT_URL = ''
UPLOAD_NOTICE = 'By uploading images to this tool you accept that the images get published under creative commons license and confirm that you have the permission to do so.'

DOWNLOAD_BASE_URL = ''  # the URL where the exact is hosted e.g. https://exact.de

ACCOUNT_ACTIVATION_DAYS = 7

UPLOAD_FS_GROUP = os.environ.get("UPLOAD_FS_GROUP", 33)  # www-data on debian

ENABLE_ZIP_DOWNLOAD = False  # If enabled, run manage.py runzipdaemon to create the zip files and keep them up to date

# Test mail functionality by printing mails to console:
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = '587'
EMAIL_HOST_USER = DJANGO_ECS_SECRETS['EMAIL_HOST_USER']
EMAIL_HOST_PASSWORD = DJANGO_ECS_SECRETS['EMAIL_HOST_PASSWORD']
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False


TOOLS_ENABLED = True
TOOLS_PATH = os.path.join(BASE_DIR, 'tools')
TOOL_UPLOAD_NOTICE = ''


# Serve Content from CloudFront
# ------------------------------------------------------------------------------
INSTALLED_APPS += [
    "collectfast", "storages"
]


# Variables used by django-storages & collectfast
STATICFILES_STORAGE = "exact.settings_aws.StaticRootS3Boto3Storage"
COLLECTFAST_STRATEGY = "collectfast.strategies.boto3.Boto3Strategy"
AWS_S3_CUSTOM_DOMAIN = os.environ.get("MY_STATIC_CDN")
AWS_STORAGE_BUCKET_NAME = os.environ.get('AWS_STORAGE_BUCKET_NAME')

# Required since storages doesn't pick up on Role access
AWS_ACCESS_KEY_ID = DJANGO_ECS_SECRETS['DJANGO_AWS_ACCESS_KEY_ID']
AWS_SECRET_ACCESS_KEY = DJANGO_ECS_SECRETS['DJANGO_AWS_SECRET_ACCESS_KEY']


# This defines the specific location and access for the objects in the bucket
# It is not required but can give fine-grained control and can be used if 
# you want to have different storage locations (buckets) used by this package
from storages.backends.s3boto3 import S3Boto3Storage  # noqa E402

class StaticRootS3Boto3Storage(S3Boto3Storage):
    location = "static"
    default_acl = "public-read"
