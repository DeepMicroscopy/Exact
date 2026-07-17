from django.urls import path
from . import views

app_name = 'tables'

urlpatterns = [
    path('<int:imageset_id>/',                                       views.table_list,               name='list'),
    path('dataset/<int:dataset_id>/',                                views.table_view,               name='view'),
    path('api/<int:dataset_id>/data/',                               views.table_data_api,           name='data'),
    path('api/<int:dataset_id>/save/',                               views.table_save_api,           name='save'),
    path('api/<int:dataset_id>/import/',                             views.table_import_api,         name='import'),
    path('api/<int:dataset_id>/export/csv/',                         views.table_export_csv,         name='export_csv'),
    path('api/<int:dataset_id>/export/xlsx/',                        views.table_export_xlsx,        name='export_xlsx'),
    path('api/<int:dataset_id>/versions/',                           views.table_versions_api,       name='versions'),
    path('api/<int:dataset_id>/versions/<int:version_number>/data/', views.table_version_data_api,   name='version_data'),
    path('api/<int:dataset_id>/settings/',                           views.table_settings_api,       name='settings'),
    path('api/<int:dataset_id>/delete/',                             views.table_delete_api,         name='delete'),
    path('api/resolve-url/',                                         views.resolve_url_api,           name='resolve_url'),
    path('api/ref/imagesets/',                                       views.ref_picker_imagesets_api,  name='ref_imagesets'),
    path('api/ref/imageset/<int:imageset_id>/images/',               views.ref_picker_images_api,     name='ref_images'),
]
