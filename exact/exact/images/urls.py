from django.urls import path
from django.urls import include, re_path


from . import views
from . import api_views

app_name = 'images'
urlpatterns = [
    re_path(r'^$', views.index, name='index'),
    re_path(r'^api/list_imagesets/$', views.api_index, name='Index (REST API)'),
    re_path(r'^image/delete/(\d+)/$', views.delete_images, name='delete_images'),
    re_path(r'^api/image/delete/(\d+)/$', views.delete_images_api, name='delete images (API)'),
    re_path(r'^api/image/download/(\d+)/$', views.download_image_api, name='download_api'),
    re_path(r'^image/copy/(\d+)/(\d+)/$', views.copy_image, name='copy_image'),

    re_path(r'^api/image/opened/(\d+)/$', views.image_opened, name='image_opened'),
    re_path(r'^api/image/closed/(\d+)/$', views.image_closed, name='image_closed'),

    re_path(r'^image/setfree/(\d+)/$', views.set_free, name='setfree_imageset'),
    re_path(r'^image/upload/(\d+)/$', views.upload_image, name='upload_image'),
    re_path(r'^image/(\d+)/(\d+)/(\d+)/tile/$', views.view_image, name='view_image'),
    re_path(r'^image/(\d+)/(\d+)/(\d+)/tile_files/(\d+)/(\d+_\d+.(?:png|jpeg))$', views.view_image_tile, name='view_image_tile'),
    re_path(r'^api/image/verify/$', views.api_verify_image, name='verify_image'),

    re_path(r'^api/image/plugins/$', views.image_plugins, name='plugins'),


    re_path(r'^api/image/navigator_overlay_status/$', views.navigator_overlay_status, name='navigator_overlay_status'),
    re_path(r'^image/(\d+)_navigator_overlay/(\d+)/(\d+)/(\d+)/(\d+_\d+.(?:png|jpeg))$',
        views.view_image_navigator_overlay_tile, name='view_image_navigator_overlay_tile'),

    re_path(r'^api/image/statistics/$', views.image_statistics, name='image_statistics'),
    re_path(r'^imagelist/(\d+)/$', views.list_images, name='list_images'),
    re_path(r'^imageset/(\d+)/label-upload/$', views.label_upload, name='label_upload'),
    re_path(r'^imageset/(\d+)/copy-images/$', views.copy_images_to_imageset, name='copy_images_to_imageset'),

    re_path(r'^imageset/create/$', views.create_imageset, name='create_imageset'),
    re_path(r'^imageset/(\d+)/delete/$', views.delete_imageset, name='delete_imageset'),
    re_path(r'^imageset/(\d+)/pin/$', views.toggle_pin_imageset, name='pin_imageset'),
    re_path(r'^imageset/(\d+)/edit/$', views.edit_imageset, name='edit_imageset'),

    re_path(r'^imageset/(\d+)/annotation_map/create/$', views.create_annotation_map, name='create_annotation_map'),
    re_path(r'^imageset/(\d+)/annotation_map/sync/$', views.sync_annotation_map, name='sync_annotation_map'),

    re_path(r'^imageset/(\d+)/$', views.view_imageset, name='view_imageset'),
    re_path(r'^imageset/(\d+)/download/$', views.download_imageset_zip, name='download_imageset'),
    path('delete_jobs/<int:plugin_id>/<int:imageset_id>', views.delete_jobs, name='delete_jobs'),

    re_path(r'^imageset/explore_new/$', api_views.ImageSetViewSet.as_view({'get': 'list'}), name='explore_imageset_new'),

    re_path(r'^imageset/explore/$', views.explore_imageset, name='explore_imageset'),
    re_path(r'^imageset/exact_dl_script.py$', views.dl_script, name='dl_script'),
    re_path(r'^api/imageset/create/$', views.create_imageset_api, name='create_imageset_api'),
    re_path(r'^api/imageset/load/$', views.load_image_set, name='load_image_set'),
    re_path(r'^api/imageset/tag/add/$', views.tag_image_set, name='tag_image_set'),
    re_path(r'^api/imageset/tag/delete/$', views.remove_image_set_tag, name='remove_image_set_tag'),
    re_path(r'^api/imageset/tag/autocomplete/$', views.autocomplete_image_set_tag, name='autocomplete_image_set_tag'),

    re_path(r'^api/imageset/product/add/$', views.product_image_set, name='product_image_set'),
    re_path(r'^api/imageset/product/delete/$', views.remove_image_set_product, name='remove_image_set_product'),

]
