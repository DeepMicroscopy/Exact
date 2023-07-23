from django.urls import include, re_path

from . import views

app_name = 'tools'
urlpatterns = [
    re_path(r'^$', views.overview, name='overview'),
    re_path(r'^create/$', views.create_tool, name='create'),
    re_path(r'^delete/(\d+)/$', views.delete_tool, name='delete'),
    re_path(r'^edit/(\d+)/$', views.edit_tool, name='edit'),
    re_path(r'^download/(\d+)/$', views.download_tool, name='download'),
]
