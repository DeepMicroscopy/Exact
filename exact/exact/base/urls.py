from django.conf.urls import url

from . import views

app_name = 'base'
urlpatterns = [
    url(r'^$', views.index, name='index'),
    url(r'^timesync/$', views.report_time, name='time sync'),
    url(r'^problems/$', views.problem_report, name='problem')
]
