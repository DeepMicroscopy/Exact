from django.urls import path

from . import views

app_name = 'processing'

urlpatterns = [
    # ex: /processing/
    path('', views.index, name='index'),
    # ex: /processing/5/
    path('<int:job_id>/', views.detail, name='detail'),
    # ex: /processing/5/
    path('<int:job_id>/stop', views.stop, name='stop'),
    # ex: /processing/submit/4/3
    path('submit/<int:plugin_id>/<int:image_id>', views.submit, name='submit'),
    # ex: /processing/submit/4/3
    path('submit_imageset/<int:plugin_id>/<int:imageset_id>', views.submit_imageset, name='submit_imageset')
]
