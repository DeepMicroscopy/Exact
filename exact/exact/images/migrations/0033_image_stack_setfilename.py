# Manual migration to set filename field of images correctly, since EXACT now opens many z Stacks natively and does not require the filename change any more.
from django.db import migrations, models
from openslide import OpenSlide
import openslide
from pathlib import Path

from exact.images.models import Image
from django.conf import settings
import os
from util.slide_server import getSlideHandler

def remove_natively_handled_files_auxfiles(apps, schema_editor):
    db_alias = schema_editor.connection.alias

    for image in Image.objects.all():
        try:
            path = os.path.join(settings.IMAGE_PATH, image.image_set.path, image.name)
            if image.frames > 1:
                print('Path: ',path)
                if not os.path.exists(path):
                    continue
                slide = getSlideHandler(path)
                if slide is None:
                    continue
                if image.depth==1:
                    rp = image.image_set.root_path()
                    if not os.path.exists(rp / Path(image.filename)):
                        print('Setting image filename from: ',image.filename,'to:',image.name)
                        image.filename = image.name
                        image.save()
                    for frame in range(image.frames):
                        filepath = rp / Path(Path(image.name).stem) / "{}_{}_{}".format(1, frame+1, image.name)
                        if os.path.exists(filepath):
                            print('Removing: ', filepath)
                            os.unlink(filepath)

        except Exception as e:
            print('Exception: ',e,image)
            raise
            continue



class Migration(migrations.Migration):

    dependencies = [
        ('images', '0032_rename_descreption_framedescription_description_and_more'),
    ]

    operations = [
        migrations.RunPython(remove_natively_handled_files_auxfiles)
    ]
