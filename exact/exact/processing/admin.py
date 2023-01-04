from django.contrib import admin

from .models import Plugin, PluginResult, PluginResultEntry, PluginJob, PluginResultAnnotation, PluginResultBitmap

admin.site.register(Plugin)
admin.site.register(PluginResult)
admin.site.register(PluginResultEntry)
admin.site.register(PluginJob)
admin.site.register(PluginResultAnnotation)
admin.site.register(PluginResultBitmap)
