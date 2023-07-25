from django.urls import include, re_path

from . import views

app_name = 'administration'
urlpatterns = [
    re_path(r'^$', views.annotation_types, name='index'),
    re_path(r'^log/$', views.logs, name='log'),

    #region api v1

    re_path(r'^api/annotation_type/create/$', views.api_create_annotation_type, name='api_create_annotation_type'),
    re_path(r'^api/annotation_type/delete/$', views.api_delete_annotation_type, name='api_delete_annotation_type'),

    #endregion

    re_path(r'^products/list/$', views.products, name='products'),
    re_path(r'^products/(\d+)/$', views.product, name='product'),
    re_path(r'^products/create/$', views.create_product, name='create_product'),

    re_path(r'^products/edit/(\d+)/$', views.edit_product, name='edit_product'),
    re_path(r'^plugins/list/$', views.plugins, name='plugins'),

    re_path(r'^api/plugins/product/add/$', views.add_plugin_product, name='add_plugin_product'),
    re_path(r'^api/plugins/product/delete/$', views.remove_plugin_product, name='remove_plugin_product'),


    re_path(r'^annotation_type/list/$', views.annotation_types, name='annotation_types'),
    re_path(r'^annotation_type/(\d+)/$', views.annotation_type, name='annotation_type'),
    re_path(r'^annotation_type/create/$', views.create_annotation_type, name='create_annotation_type'),
    re_path(r'^annotation_type/edit/(\d+)/$', views.edit_annotation_type, name='edit_annotation_type'),
    re_path(r'^annotation_type/delete/(\d+)/$', views.delete_annotation_type, name='delete_annotation_type'),
    re_path(r'^annotation_type/migrate/bbt0p/(\d+)/$', views.migrate_bounding_box_to_0_polygon, name='migrate_bbt0p'),
    re_path(r'^annotation_type/migrate/bbt4p/(\d+)/$', views.migrate_bounding_box_to_4_polygon, name='migrate_bbt4p'),
]
