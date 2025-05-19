from django.contrib import admin

# Register your models here.
from .models import Image, ImageSet, SetTag, AuxiliaryFile, ImageRegistration

admin.site.register(ImageSet)
admin.site.register(Image)
admin.site.register(SetTag)
admin.site.register(ImageRegistration)
admin.site.register(AuxiliaryFile)
