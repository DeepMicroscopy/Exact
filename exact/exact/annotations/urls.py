from django.urls import include, re_path

from . import views

app_name = 'annotations'
urlpatterns = [
    re_path(r'^export/create/$', views.create_exportformat, name='create_exportformat'),
    re_path(r'^export/(\d+)/edit/$', views.edit_exportformat, name='edit_exportformat'),
    re_path(r'^export/(\d+)/delete/$', views.delete_exportformat, name='delete_exportformat'),
    re_path(r'^export/(\d+)/auth/$', views.export_auth, name='export_auth'),
    re_path(r'^export/(\d+)/download/$', views.download_export, name='download_export'),
    re_path(r'^export/(\d+)/$', views.create_export, name='create_export'),
    re_path(r'^manage/annotation/(\d+)/$', views.manage_annotations, name='manage_annotations'),
    re_path(r'^manage/delete/(\d+)/$', views.delete_annotations, name='delete_annotations'),
    re_path(r'^(\d+)/delete/$', views.delete_annotation, name='delete_annotation'),
    re_path(r'^(\d+)/$', views.annotate, name='annotate'),
    re_path(r'^$', views.annotate, name='annotate_without_parameters'),
    re_path(r'^annotateset/(\d+)/$', views.annotate_set, name='annotate_set'),
    re_path(r'^(\d+)/verify/$', views.verify, name='verify'),
    re_path(r'^api/annotation/create/$', views.create_annotation, name='create_annotation'),
    re_path(r'^api/annotation/delete/$', views.api_delete_annotation, name='delete_annotation'),
    re_path(r'^api/annotation/copy/(\d+)/(\d+)$', views.api_copy_annotation, name='copy_annotation'),

    re_path(r'^api/annotation/load/$', views.load_annotations, name='load_annotations'),  # loads annotations of an image
    re_path(r'^api/annotation/loadset/$', views.load_set_annotations, name='load_set_annotations'),  # loads annotations of an image
    re_path(r'^api/annotation/loadannotationtypes/$', views.load_annotation_types, name='load_annotation_types'),  # loads all active annotation types
    re_path(r'^api/annotation/loadsetannotationtypes/$', views.load_set_annotation_types, name='load_set_annotation_types'),  # loads annotations of an image
    re_path(r'^api/annotation/loadfilteredset/$', views.load_filtered_set_annotations, name='load_filtered_set_annotations'),  # loads filtered annotations of an image
    re_path(r'^api/annotation/loadone/$', views.load_annotation, name='load_annotation'),
    re_path(r'^api/annotation/verify/$', views.api_verify_annotation, name='verify_annotation'),
    re_path(r'^api/annotation/update/$', views.update_annotation, name='update_annotations'),
    re_path(r'^api/annotation/blurred_concealed/$', views.api_blurred_concealed_annotation, name='blurred_concealed_annotation'),

    re_path(r'^api/annotation/mediafile/upload/(\d+)/(\d+)/$', views.api_create_annotation_mediafile, name='api_create_annotation_mediafile'),
    re_path(r'^api/annotation/mediafile/delete/$', views.api_delete_annotation_mediafile, name='api_delete_annotation_mediafile'),
    re_path(r'^api/annotation/mediafile/update/$', views.api_update_annotation_mediafile, name='api_update_annotation_mediafile'),
]
