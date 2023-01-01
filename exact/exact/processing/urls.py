from django.urls import path

from . import views

urlpatterns = [
    # ex: /processing/
    path('', views.index, name='index'),
    # ex: /processing/5/
    path('<int:job_id>/', views.detail, name='detail'),
]
