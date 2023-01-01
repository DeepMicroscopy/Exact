from django.contrib import admin

from .models import Plugin, PluginResult, PluginResultEntry, PluginJob

admin.site.register(Plugin)
admin.site.register(PluginResult)
admin.site.register(PluginResultEntry)
admin.site.register(PluginJob)

