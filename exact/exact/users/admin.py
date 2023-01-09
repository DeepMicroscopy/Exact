from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Team, TeamMembership, User, UI_User

admin.site.register(Team)
admin.site.register(TeamMembership)
admin.site.register(User, UserAdmin)
admin.site.register(UI_User)
