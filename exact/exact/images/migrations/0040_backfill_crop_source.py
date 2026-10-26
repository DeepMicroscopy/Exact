import re
from pathlib import Path

from django.db import migrations
from django.db.models import Q

# crop_from_image names crops "<name of the source file without extension>x<x>_y<y>_z<z>_w<w>_h<h>.tiff"
CROP_NAME = re.compile(r'^(?P<stem>.+)x(?P<x>\d+)_y(?P<y>\d+)_z(?P<z>\d+)_w(?P<w>\d+)_h(?P<h>\d+)\.tiff$')
CROP_NAME_SQL = r'x[0-9]+_y[0-9]+_z[0-9]+_w[0-9]+_h[0-9]+\.tiff$'


def crop_stem(image):
    """The part of the name of a crop that comes from the source image (see crop_from_image)."""
    if image.depth > 1:
        # the file of a z-stack is stored as <stem>/<depth>_<frame>_<name>, crops are taken from 1_1_<name>
        return '1_1_' + Path(image.name).stem
    return Path(image.filename).stem


def find_source(Image, crop, match):
    """
    The image a crop was taken from: an image of the same team whose name fits and that contains the region.
    If several images fit (copies of an image in other image sets), the one in the same image set as the crop
    is preferred and otherwise the oldest one, which is the original and not a copy.
    """
    stem = match.group('stem')
    x, y, z, w, h = (int(match.group(key)) for key in ('x', 'y', 'z', 'w', 'h'))

    name_prefixes = {stem + '.'}
    if stem.startswith('1_1_'):
        name_prefixes.add(stem[len('1_1_'):] + '.')
    candidates = Image.objects.filter(image_set__team_id=crop.image_set.team_id) \
        .exclude(id=crop.id).exclude(image_type=1)  # 1: server generated
    name_filter = Q()
    for prefix in name_prefixes:
        name_filter |= Q(filename__startswith=prefix) | Q(name__startswith=prefix)
    candidates = candidates.filter(name_filter).select_related('image_set').order_by('id')

    fitting = [c for c in candidates
               if crop_stem(c) == stem
               and x + w <= c.width and y + h <= c.height
               and 0 <= z < max(c.frames, c.depth, 1)]
    if not fitting:
        return None
    same_set = [c for c in fitting if c.image_set_id == crop.image_set_id]
    return (same_set or fitting)[0]


def backfill_crop_sources(Image):
    """Fills crop_source, crop_x, crop_y and crop_frame of crops that were created before these fields existed."""
    linked = 0
    crops = Image.objects.filter(crop_source__isnull=True, name__regex=CROP_NAME_SQL) \
        .exclude(image_type=1).select_related('image_set')
    for crop in crops:
        match = CROP_NAME.match(crop.name)
        # the size in the name has to be the size of the image: other images can have similar names
        if match is None or int(match.group('w')) != crop.width or int(match.group('h')) != crop.height:
            continue
        source = find_source(Image, crop, match)
        if source is None:
            continue
        crop.crop_source = source
        crop.crop_x = int(match.group('x'))
        crop.crop_y = int(match.group('y'))
        crop.crop_frame = int(match.group('z'))
        crop.save(update_fields=['crop_source', 'crop_x', 'crop_y', 'crop_frame'])
        linked += 1
    return linked


def forwards(apps, schema_editor):
    backfill_crop_sources(apps.get_model('images', 'Image'))


class Migration(migrations.Migration):

    dependencies = [
        ('images', '0039_image_crop_source'),
    ]

    operations = [
        # the filled in values can not be told from values that were set later, so nothing is undone
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
