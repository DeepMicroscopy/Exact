from django.conf.urls import url

from . import views

app_name = 'administration'
urlpatterns = [
    url(r'^$', views.annotation_types, name='index'),

    url(r'^products/list/$', views.products, name='products'),
    url(r'^products/(\d+)/$', views.product, name='product'),
    url(r'^products/create/$', views.create_product, name='create_product'),
    url(r'^products/edit/(\d+)/$', views.edit_product, name='edit_product'),


    url(r'^api/annotation_type/create/$', views.api_create_annotation_type, name='api_create_annotation_type'),
    url(r'^annotation_type/list/$', views.annotation_types, name='annotation_types'),
    url(r'^annotation_type/(\d+)/$', views.annotation_type, name='annotation_type'),
    url(r'^annotation_type/create/$', views.create_annotation_type, name='create_annotation_type'),
    url(r'^annotation_type/edit/(\d+)/$', views.edit_annotation_type, name='edit_annotation_type'),
    url(r'^annotation_type/migrate/bbt0p/(\d+)/$', views.migrate_bounding_box_to_0_polygon, name='migrate_bbt0p'),
    url(r'^annotation_type/migrate/bbt4p/(\d+)/$', views.migrate_bounding_box_to_4_polygon, name='migrate_bbt4p'),
]
