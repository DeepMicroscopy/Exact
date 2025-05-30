from django.contrib import admin

# Register your models here.
<<<<<<< HEAD
from .models import Image, ImageSet, SetTag, AuxiliaryFile
=======
from .models import Image, ImageSet, SetTag, AuxiliaryFile, ImageRegistration
>>>>>>> 673dfaf818942d8dccdb0c5a80ef7555c7b57dc6

admin.site.register(ImageSet)
admin.site.register(Image)
admin.site.register(SetTag)
<<<<<<< HEAD
=======
admin.site.register(ImageRegistration)
>>>>>>> 673dfaf818942d8dccdb0c5a80ef7555c7b57dc6
admin.site.register(AuxiliaryFile)
