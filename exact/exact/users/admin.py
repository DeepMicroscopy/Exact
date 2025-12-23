from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Team, TeamMembership, User, UserPreferences

class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff', 'last_login')

admin.site.register(Team)
admin.site.register(TeamMembership)
admin.site.register(User, CustomUserAdmin)
admin.site.register(UserPreferences)
