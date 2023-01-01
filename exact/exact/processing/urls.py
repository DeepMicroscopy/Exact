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
]
