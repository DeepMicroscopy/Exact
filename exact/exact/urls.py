"""exact URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/1.10/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  url(r'^$', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  url(r'^$', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.conf.urls import url, include
    2. Add a URL to urlpatterns:  url(r'^blog/', include('blog.urls'))
"""
import logging
from django.conf.urls import url, include
from django.urls import path
from django.contrib import admin
from django.shortcuts import render
from django.conf import settings
from django.conf.urls.static import static
from django_registration.backends.activation.views import RegistrationView

from .api import router, router_api
from .users.forms import UserRegistrationForm
from rest_framework.schemas import get_schema_view

logger = logging.getLogger('django')

schema_view = get_schema_view(
        title="EXACT - API",
        description="API to interact with the EXACT Server",
        version="1.0.0",
        url=r"/api/v1/",
        patterns=router_api.urls,
        urlconf='exact.urls'
    )

urlpatterns = [
    url(r'^user/', include('django.contrib.auth.urls')),
    url(r'^accounts/register/$', RegistrationView.as_view(form_class=UserRegistrationForm)),
    url(r'^accounts/', include('django_registration.backends.activation.urls')),
    url(r'^accounts/', include('django.contrib.auth.urls')),
    url(r'^', include('exact.base.urls')),
    url(r'^admin/', admin.site.urls),
    url(r'^administration/', include('exact.administration.urls')),
    url(r'^annotations/', include('exact.annotations.urls')),
    url(r'^images/', include('exact.images.urls')),
    url(r'^users/', include('exact.users.urls')),
    url(r'^tagger_messages/', include('exact.tagger_messages.urls')),
    url(r'^tools/', include('exact.tools.urls')),
    url(r'^datasets/', include('exact.datasets.urls')),

    url('', include(router.urls)),

    path('api/v1/', include(router_api.urls)),
    path('api/v1/openapi', schema_view, name='openapi-schema'),

    #path('auth/', include('djoser.urls.authtoken')),
] + static(settings.MEDIA_URL, document_root= settings.MEDIA_ROOT)

if settings.DEBUG:
    try:
        import debug_toolbar
        urlpatterns += [path('__debug__/', include(debug_toolbar.urls))]
    except ImportError as e:
        logger.error(e)

def handler500(request):
    """500 error handler which includes ``request`` in the context.

    Templates: `500.html`
    Context: None
    """
    return render(request, '500.html', status=500)
