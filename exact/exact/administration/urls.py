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

    re_path(r'users/$', views.user_management, name='user_management'),
    # AJAX API for the management UI
    re_path(r'^users/api/list/$', views.user_list_api, name='user_list_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/detail/$', views.user_detail_api, name='user_detail_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/toggle-active/$', views.user_toggle_active_api, name='user_toggle_active_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/toggle-staff/$', views.user_toggle_staff_api, name='user_toggle_staff_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/send-password-reset/$', views.user_send_password_reset_api, name='user_send_password_reset_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/update/$', views.user_update_api, name='user_update_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/delete/$', views.user_delete_api, name='user_delete_api'),
    re_path(r'^users/api/teams/list/$', views.team_list_api, name='team_list_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/teams/add/$', views.user_team_add_api, name='user_team_add_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/teams/(?P<team_id>\d+)/remove/$', views.user_team_remove_api, name='user_team_remove_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/teams/(?P<team_id>\d+)/toggle-admin/$', views.user_team_toggle_admin_api, name='user_team_toggle_admin_api'),
    re_path(r'^users/api/(?P<user_id>\d+)/set-random-password/$', views.user_set_random_password_api, name='user_set_random_password_api'),
    
    re_path(r'^products/edit/(\d+)/$', views.edit_product, name='edit_product'),
    re_path(r'^plugins/list/$', views.plugins, name='plugins'),
    re_path(r'^storage/$', views.storage, name='storage'),

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
