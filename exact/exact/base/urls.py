from django.urls import re_path
from . import views

app_name = 'base'
urlpatterns = [
    re_path(r'^$', views.index, name='index'),
    re_path(r'^timesync/$', views.report_time, name='time sync'),
    re_path(r'^problems/$', views.problem_report, name='problem')
]
