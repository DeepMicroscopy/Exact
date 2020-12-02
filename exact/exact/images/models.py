from typing import Set

from django.db import connection
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models

from django.db.models import Count, Q, Sum
from django.db.models.expressions import F

import os
import numpy as np
import cv2
import openslide
from openslide import OpenSlide, open_slide
from czifile import czi2tif
from util.cellvizio import ReadableCellVizioMKTDataset # just until data access is pip installable

from PIL import Image as PIL_Image

from datetime import datetime
from pathlib import Path
import tifffile

from exact.users.models import Team


class Image(models.Model):

    class ImageSourceTypes:
        DEFAULT = 0
        SERVER_GENERATED = 1
        FILE_LINK = 2

    SOURCE_TYPES = (
        (ImageSourceTypes.DEFAULT, 'Default'),
        (ImageSourceTypes.SERVER_GENERATED, 'Server Generated'),
        (ImageSourceTypes.FILE_LINK, 'File Link Generated')
    )
    thumbnail_extension = "_thumbnail.png"

    image_set = models.ForeignKey(
        'ImageSet', on_delete=models.CASCADE, related_name='images')
    name = models.CharField(max_length=256)
    filename = models.CharField(max_length=256)
    time = models.DateTimeField(auto_now_add=True)
    checksum = models.BinaryField()
    mpp = models.FloatField(default=0)
    objectivePower = models.FloatField(default=1)
    
    width = models.IntegerField(default=800) #x
    height = models.IntegerField(default=600) #y
    depth = models.IntegerField(default=1) #z
    frames = models.IntegerField(default=1) #z
    channels = models.IntegerField(default=3) 
    

    image_type = models.IntegerField(choices=SOURCE_TYPES, default=ImageSourceTypes.DEFAULT)

    def get_file_name(self, depth=1, frame=1): 
        if depth > 1 or frame > 1 or self.frames > 1 or self.depth > 1:
            return str(Path(Path(self.name).stem) / "{}_{}_{}".format(depth, frame, self.name))
        else:
            return self.filename

    def path(self, depth=1, frame=1):
        return os.path.join(self.image_set.root_path(), self.get_file_name(depth, frame))

    def original_path(self):
        return os.path.join(self.image_set.root_path(), self.name)

    def relative_path(self, depth=1, frame=1):
        return os.path.join(self.image_set.path, self.get_file_name(depth, frame))

    def thumbnail_path(self, depth=1, frame=1):
        return os.path.join(self.image_set.root_path(), Path(self.get_file_name(depth, frame)).stem + self.thumbnail_extension )

    def thumbnail_relative_path(self, depth=1, frame=1):
        return os.path.join(self.image_set.root_path(), Path(self.get_file_name(depth, frame)).stem + self.thumbnail_extension )

    def delete(self, *args, **kwargs):
        self.image_set.zip_state = ImageSet.ZipState.INVALID
        self.image_set.save(update_fields=('zip_state',))
        super(Image, self).delete(*args, **kwargs)

    def save(self, *args, **kwargs):
        self.image_set.zip_state = ImageSet.ZipState.INVALID
        self.image_set.save(update_fields=('zip_state',))
        super(Image, self).save(*args, **kwargs)


    def save_file(self, path:Path):

        try:
            # check if the file can be opened by OpenSlide if not convert it
            try:
                osr = OpenSlide(str(path))
                self.filename = path.name
            except:
                import pyvips
                old_path = path

                #check if it is a CellVizio MKT file by suffix and save each frame to a seperate file
                if Path(path).suffix.lower().endswith(".mkt"):
                    reader = ReadableCellVizioMKTDataset(str(path))
                    self.frames = reader.numberOfFrames
                    self.channels = 1
                    self.mpp = (float(reader.mpp_x) + float(reader.mpp_y)) / 2
                    # create sub dir to save frames
                    folder_path = Path(self.image_set.root_path()) / path.stem
                    os.makedirs(str(folder_path), exist_ok =True)
                    os.chmod(str(folder_path), 0o777)
                    for frame_id in range(self.frames):
                        height, width = reader.dimensions 
                        np_image = np.array(reader.read_region(location=(0,0), size=(reader.dimensions), level=0, zLevel=frame_id))[:,:,0]
                        linear = np_image.reshape(height * width * self.channels)
                        vi = pyvips.Image.new_from_memory(np.ascontiguousarray(linear.data), height, width, self.channels, 'uchar')

                        target_file = folder_path / "{}_{}_{}".format(1, frame_id + 1, path.name) #z-axis frame image
                        vi.tiffsave(str(target_file), tile=True, compression='lzw', bigtiff=True, pyramid=True,  tile_width=256, tile_height=256)

                        # save first frame as default file for thumbnail etc.
                        if frame_id == 0:
                            self.filename = target_file.name
                # check if its a zeiss file
                elif  Path(path).suffix.lower().endswith(".czi"):
                    path_temp = Path(path).with_suffix('.tif')
                    path = Path(path).with_suffix('.tiff')

                    czi2tif(str(old_path), tiffile=str(path_temp), bigtiff=True)

                    vi = pyvips.Image.new_from_file(str(path_temp))
                    vi.tiffsave(str(path), tile=True, compression='jpeg', bigtiff=True, pyramid=True, tile_width=256, tile_height=256, Q=90)

                    os.remove(str(path_temp))
                    self.filename = path.name
                # Videos
                elif Path(path).suffix.lower().endswith(".avi"):
                    dtype_to_format = {
                                    'uint8': 'uchar',
                                    'int8': 'char',
                                    'uint16': 'ushort',
                                    'int16': 'short',
                                    'uint32': 'uint',
                                    'int32': 'int',
                                    'float32': 'float',
                                    'float64': 'double',
                                    'complex64': 'complex',
                                    'complex128': 'dpcomplex',
                                }

                    folder_path = Path(self.image_set.root_path()) / path.stem
                    os.makedirs(str(folder_path), exist_ok =True)
                    os.chmod(str(folder_path), 0o777)

                    cap = cv2.VideoCapture(str(Path(path)))
                    frame_id = 0
                    while cap.isOpened():
                        ret, frame = cap.read()
                        if not ret:
                            # if video has just one frame copy file to top layer
                            if frame_id == 1:
                                copy_path = Path(path).with_suffix('.tiff')
                                shutil.copyfile(str(target_file), str(copy_path))
                                self.filename = copy_path.name
                            break

                        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        height, width, bands = frame.shape
                        linear = frame.reshape(width * height * bands)

                        vi = pyvips.Image.new_from_memory(np.ascontiguousarray(linear.data), width, height, bands,
                                                                        dtype_to_format[str(frame.dtype)])
                        if dtype_to_format[str(frame.dtype)] not in ["uchar"]:
                            vi = vi.scaleimage()

                        height, width, channels = vi.height, vi.width, vi.bands
                        self.channels = channels

                        target_file = folder_path / "{}_{}_{}".format(1, frame_id + 1, path.name) #z-axis frame image
                        vi.tiffsave(str(target_file), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)

                        # save first frame as default file for thumbnail etc.
                        if frame_id == 0:
                            self.filename = target_file.name
                        frame_id += 1
                                    
                    self.frames = frame_id
                # check if file is philips iSyntax
                elif Path(path).suffix.lower().endswith(".isyntax"):
                    from util.ISyntaxContainer import ISyntaxContainer
                    old_path = path
                    path = Path(path).with_suffix('.tiff')

                    converter = ISyntaxContainer(str(old_path))
                    converter.convert(str(path), 0)
                    self.objectivePower = 40
                    self.filename = path.name
                # check if possible multi frame tiff
                elif path.suffix.lower().endswith(".tiff") or path.suffix.lower().endswith(".tif"):
                    shape = tifffile.imread(str(path)).shape
                    image_saved = False
                    if len(shape) >= 3: # possible multi channel or frames
                        #Possible formats (10, 300, 300, 3) (10, 300, 300)
                        if (len(shape) == 4 and shape[-1] in [1, 3, 4]) or len(shape) == 3 and shape[-1] not in [1, 3, 4]: 
                            image_saved = True
                            frames = shape[0]
                            self.frames = frames

                            folder_path = Path(self.image_set.root_path()) / path.stem
                            os.makedirs(str(folder_path), exist_ok =True)
                            os.chmod(str(folder_path), 0o777)

                            for frame_id in range(shape[0]):
                                vi = pyvips.Image.new_from_file(str(path), page=frame_id)
                                vi = vi.scaleimage()
                                height, width, channels = vi.height, vi.width, vi.bands
                                self.channels = channels

                                target_file = folder_path / "{}_{}_{}".format(1, frame_id + 1, path.name) #z-axis frame image
                                vi.tiffsave(str(target_file), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)

                                # save first frame as default file for thumbnail etc.
                                if frame_id == 0:
                                    self.filename = target_file.name
                        if image_saved == False:
                            path = Path(path).with_suffix('.tiff')

                            vi = pyvips.Image.new_from_file(str(old_path))
                            vi.tiffsave(str(path), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)
                            self.filename = path.name
                    else:
                        path = Path(path).with_suffix('.tiff')
                        if old_path == path:
                            path = Path(path).with_suffix('.tif')

                        vi = pyvips.Image.new_from_file(str(old_path))
                        vi.tiffsave(str(path), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)
                        self.filename = path.name
                else:                            
                    path = Path(path).with_suffix('.tiff')

                    vi = pyvips.Image.new_from_file(str(old_path))
                    vi.tiffsave(str(path), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)
                    self.filename = path.name

            osr = OpenSlide(self.path())
            self.width, self.height = osr.level_dimensions[0]
            try:
                mpp_x = osr.properties[openslide.PROPERTY_NAME_MPP_X]
                mpp_y = osr.properties[openslide.PROPERTY_NAME_MPP_Y]
                self.mpp = (float(mpp_x) + float(mpp_y)) / 2
            except (KeyError, ValueError):
                self.mpp = 0
            try:
                self.objectivePower = osr.properties[openslide.PROPERTY_NAME_OBJECTIVE_POWER]
            except (KeyError, ValueError):
                self.objectivePower = 1
            self.save()
        except Exception as e:
            os.remove(str(path))
            raise

    def __str__(self):
        return u'Image: {0}'.format(self.name)

    def __repr__(self):
        return u'Image: {0}'.format(self.name)


class ImageSet(models.Model):
    class Meta:
        unique_together = [
            'name',
            'team',
        ]

    class CollaborationTypes:
        COLLABORATIVE = 0
        COMPETITIVE = 1
        SECONDOPINION = 2

    COLLABORATION_TYPES = (
        (CollaborationTypes.COLLABORATIVE, 'Collaborative'),
        (CollaborationTypes.COMPETITIVE, 'Competitive'),
        (CollaborationTypes.SECONDOPINION, 'SecondOpinion'),
    )

    PRIORITIES = (
        (1, 'High'),
        (0, 'Normal'),
        (-1, 'Low'),
    )


    class ZipState:
        INVALID = 0
        READY = 1
        PROCESSING = 2

    ZIP_STATES = (
        (ZipState.INVALID, 'invalid'),
        (ZipState.READY, 'ready'),
        (ZipState.PROCESSING, 'processing'),
    )

    path = models.CharField(max_length=256, unique=True, null=True)
    name = models.CharField(max_length=256)
    location = models.CharField(max_length=256, null=True, blank=True)
    description = models.TextField(max_length=1000, null=True, blank=True)
    time = models.DateTimeField(auto_now_add=True)
    team = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        related_name='image_sets',
        null=True,
    )
    creator = models.ForeignKey(settings.AUTH_USER_MODEL,
                                default=None,
                                on_delete=models.SET_NULL,
                                null=True,
                                blank=True)
    public = models.BooleanField(default=False)
    public_collaboration = models.BooleanField(default=False)
    image_lock = models.BooleanField(default=False)
    priority = models.IntegerField(choices=PRIORITIES, default=0)
    main_annotation_type = models.ForeignKey(
        to='annotations.AnnotationType',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        default=None
    )
    pinned_by = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='pinned_sets')
    zip_state = models.IntegerField(choices=ZIP_STATES, default=ZipState.INVALID)
    collaboration_type = models.IntegerField(choices=COLLABORATION_TYPES, default=CollaborationTypes.COLLABORATIVE)

    def root_path(self):
        return os.path.join(settings.IMAGE_PATH, self.path)

    def zip_path(self):
        return os.path.join(self.path, self.zip_name())

    def zip_name(self):
        return "imageset_{}.zip".format(self.id)

    def tmp_zip_path(self):
        return os.path.join(self.path, ".tmp." + self.zip_name())

    def create_folder(self):
        self.path = '{}_{}_{}'.format(connection.settings_dict['NAME'], self.team.id,
                                           self.id)
        self.save()

        folder_path = self.root_path()
        os.makedirs(folder_path, exist_ok=True)
        os.chmod(folder_path, 0o777)


    @property
    def image_count(self):
        if hasattr(self, 'image_count_agg'):
            return self.image_count_agg
        return self.images.count()

    def get_perms(self, user: get_user_model()) -> Set[str]:
        """Get all permissions of the user."""
        perms = set()
        if self.team is not None:
            if self.team.is_admin(user):
                perms.update({
                    'verify',
                    'annotate',
                    'create_export',
                    'delete_annotation',
                    'delete_export',
                    'delete_set',
                    'delete_images',
                    'edit_annotation',
                    'edit_set',
                    'read',
                })
            if self.team.is_member(user):
                perms.update({
                    'verify',
                    'annotate',
                    'create_export',
                    'delete_annotation',
                    'delete_export',
                    'edit_annotation',
                    'edit_set',
                    'read',
                })
            if user == self.creator:
                perms.update({
                    'verify',
                    'annotate',
                    'create_export',
                    'delete_annotation',
                    'delete_export',
                    'delete_set',
                    'delete_images',
                    'edit_annotation',
                    'edit_set',
                    'read',
                })
        if self.public:
            perms.update({
                'read',
                'create_export',
            })
            if self.public_collaboration:
                perms.update({
                    'verify',
                    'annotate',
                    'delete_annotation',
                    'edit_annotation',
                })
        return perms

    def has_perm(self, permission: str, user: get_user_model()) -> bool:
        """Check whether user has specified permission."""
        return permission in self.get_perms(user)

    def __str__(self):
        return u'Imageset: {0}'.format(self.name)

    @property
    def prio_symbol(self):
        if self.priority == -1:
            return '<span class="glyphicon glyphicon-download" data-toggle="tooltip" data-placement="right" title="Low labeling priority"></span>'
        elif self.priority == 0:
            return ''
        elif self.priority == 1:
            return '<span class="glyphicon glyphicon-exclamation-sign" data-toggle="tooltip" data-placement="right" title="High labeling priority"></span>'


    def get_verified_ids(self, user):
        images = Image.objects.filter(image_set=self).order_by('name')

        if self.collaboration_type == ImageSet.CollaborationTypes.COLLABORATIVE:
            # find all images with verified annotations
            images = images.filter(annotations__annotation_type__active=True, annotations__deleted=False,
                                 annotations__verifications__verified=True)

        if self.collaboration_type == ImageSet.CollaborationTypes.COMPETITIVE:
            # find all images with verified annotations
            images = images.filter(annotations__annotation_type__active=True, annotations__deleted=False,
                                 annotations__verifications__verified=True, annotations__user=user)
            # remove all with one unverified id
            images = images.exclude(id__in=images.filter(annotations__annotation_type__active=True,
                                                         annotations__deleted=False,
                                                         annotations__verifications__verified=False,
                                                         annotations__user=user))


        return images

    def get_unverified_ids(self, user):
        images = Image.objects.filter(image_set=self).order_by('name')

        if self.collaboration_type == ImageSet.CollaborationTypes.COLLABORATIVE:
            unverified = images.filter(Q(annotations__annotation_type__active=True, annotations__deleted=False,
                                       annotations__verifications__verified=False) |
                                       Q(annotations__annotation_type__active=True, annotations__deleted=False,
                                       annotations__verifications=None))\
                .distinct()
            unannotated = images.annotate(annotation_count=Count('annotations')).filter(annotation_count__exact=0).distinct()

            # TODO_ Convert to single query
            images =  Image.objects.filter(id__in = [a.id for a in unverified] + [a.id for a in unannotated]) #Q(unverified) | Q(unannotated)


        if self.collaboration_type == ImageSet.CollaborationTypes.COMPETITIVE:
            unverified = images.filter(Q(annotations__annotation_type__active=True, annotations__deleted=False,
                                       annotations__verifications__verified=False, annotations__user=user) |
                                       Q(annotations__annotation_type__active=True, annotations__deleted=False,
                                         annotations__verifications=None, annotations__user=user)
                                       ).distinct()
            unannotated = images.annotate(annotation_count=Count('annotations', filter=Q(annotations__user=user)))\
                .filter(annotation_count__exact=0).distinct()

            # TODO_ Convert to single query
            images =  Image.objects.filter(id__in = [a.id for a in unverified] + [a.id for a in unannotated]) #Q(unverified) | Q(unannotated)

        # if there are any unverified images but the verified tag was added.
        # remove tag

        # TODO: Implement and test
        if (False):
            tag_name = "verified"
            if any(images) and self.set_tags.filter(name=tag_name).exists():
                for tag in self.set_tags.filter(name="verified"):
                    tag.delete()
            if images.count() == 0 and not self.set_tags.filter(name=tag_name).exists():
                # TODO: validate the name?
                # TODO: this in better?
                if SetTag.objects.filter(name=tag_name).exists():
                    tag = SetTag.objects.get(name=tag_name)
                else:
                    tag = SetTag(name=tag_name)
                    # TODO this in better?
                    tag.save()
                tag.imagesets.add(self)
                tag.save()


        return images


class SetTag(models.Model):
    name = models.CharField(max_length=100, unique=True)
    imagesets = models.ManyToManyField(ImageSet, related_name='set_tags')

    def __str__(self):
        return u'Tag: {0} '.format(self.name)


def version_directory_path(instance, filename):
    return 'versions/{0}_{1}/{2}'.format(instance.name, instance.id, filename)

class SetVersion(models.Model):
    name = models.CharField(max_length=100, unique=True)
    imagesets = models.ManyToManyField(ImageSet, related_name='set_versions')
    time = models.DateTimeField(default=datetime.now)
    file = models.FileField(upload_to=version_directory_path, null=True)

    def __str__(self):
        return u'Version: {0} '.format(self.name)

class ScreeningMode(models.Model):
    class Meta:
        unique_together = [
            'image',
            'user',
        ]

    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name='screening')
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                             on_delete=models.SET_NULL,
                             null=True)

    screening_tiles = models.JSONField(null=True)

    x_steps = models.IntegerField(default=0)
    y_steps = models.IntegerField(default=0)

    x_resolution = models.IntegerField(default=0)
    y_resolution = models.IntegerField(default=0)

    current_index = models.IntegerField(default=0)

    def __str__(self):
        return u'ScreeningMode: {0} '.format(self.image.name, self.user.username)