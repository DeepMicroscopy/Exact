from django.urls import include, re_path

from . import views

app_name = 'tagger_messages'
urlpatterns = [
    re_path(r'^send_message/team_message/$', views.send_team_message, name='send_team_message'),
    re_path(r'^send_message/global_message/$', views.send_global_message, name='send_global_message'),
    re_path(r'^read_message/(\d+)/$', views.read_message, name='read_message'),
    re_path(r'^read_message/all/$', views.read_all_messages, name='read_all_messages'),
    re_path(r'^read_message/global_message/all/$', views.read_all_annoucements, name='read_all_annoucements'),
    re_path(r'^delete_message/(\d+)/$', views.delete_message, name='delete_message'),
    re_path(r'^overview/$', views.overview_unread, name='overview'),
    re_path(r'^overview/unread/$', views.overview_unread, name='overview_unread'),
    re_path(r'^overview/all/$', views.overview_all, name='overview_all'),
    re_path(r'^overview/sent/$', views.overview_sent_active, name='overview_sent'),
    re_path(r'^overview/sent/active/$', views.overview_sent_active, name='overview_sent_active'),
    re_path(r'^overview/sent/hidden/$', views.overview_sent_hidden, name='overview_sent_hidden'),
    re_path(r'^overview/global/$', views.overview_global_active, name='overview_global'),
    re_path(r'^overview/global/active/$', views.overview_global_active, name='overview_global_active'),
    re_path(r'^overview/global/hidden/$', views.overview_global_hidden, name='overview_global_hidden'),
]
