from django.urls import include, re_path

from . import views


app_name = 'users'
urlpatterns = [
    re_path(r'^api/user/autocomplete/$', views.user_autocomplete, name='user_autocomplete'),
    re_path(r'^api/team/filter/$', views.api_filter_teams, name='api_filter_teams'),
    
    re_path(r'^team/(\d+)/$', views.view_team, name='team'),
    re_path(r'^team/create/$', views.create_team, name='create_team'),
    re_path(r'^team/explore/$', views.explore_team, name='explore_team'),
    re_path(r'^team/(\d+)/add/$', views.add_team_member, name='add_team_member'),
    re_path(r'^team/(\d+)/leave/$', views.leave_team, name='leave_team'),
    re_path(r'^team/(\d+)/leave/(\d+)/$', views.leave_team, name='leave_team'),
    re_path(r'^team/(\d+)/grant_admin/(\d+)/$', views.grant_team_admin, name='grant_team_admin'),
    re_path(r'^team/(\d+)/revoke_admin/(\d+)/$', views.revoke_team_admin, name='revoke_team_admin'),
    re_path(r'^user/(\d+)/$', views.user, name='user'),
    re_path(r'^user/explore/$', views.explore_user, name='explore_user'),
]
