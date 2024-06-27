from typing import Set

from django.db import connection
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models

from django.db.models import Count, Q, Sum
from django.db.models.expressions import F

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save, m2m_changed
from django.dispatch import receiver
from django.utils.functional import cached_property
import h5py
from util.slide_server import getSlideHandler
import logging

import math
import os
import numpy as np
import cv2
import openslide
import pickle
from django.core.files.base import ContentFile
import json
from openslide import OpenSlide, open_slide
from czifile import czi2tif
from util.cellvizio import ReadableCellVizioMKTDataset # just until data access is pip installable

from PIL import Image as PIL_Image

from datetime import datetime
from pathlib import Path
import tifffile
from aicsimageio import AICSImage, exceptions
from tifffile import TiffFile, TiffFileError

from exact.users.models import Team

logger = logging.getLogger('django')

from util.enums import FrameType

class FrameDescription(models.Model):

    FRAME_TYPES = (
        (FrameType.ZSTACK, 'z Stack'),
        (FrameType.TIMESERIES,'time series'),
        (FrameType.UNDEFINED,'undefined')
    )

    frame_type = models.IntegerField(choices=FRAME_TYPES, default=FrameType.ZSTACK)
    description = models.CharField(max_length=160)
    file_path = models.CharField(default='', max_length=320)
    frame_id = models.IntegerField(default=0)
    Image = models.ForeignKey('Image',  on_delete=models.CASCADE, related_name='FrameDescriptions')


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
    defaultFrame = models.IntegerField(default=0) # to set the frame that is loaded by default
    

    image_type = models.IntegerField(choices=SOURCE_TYPES, default=ImageSourceTypes.DEFAULT)

    def get_file_name(self, depth=1, frame=1): 
        if depth > 1 or self.depth > 1:
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
        #self.image_set.zip_state = ImageSet.ZipState.INVALID
        #self.image_set.save(update_fields=('zip_state',))
        super(Image, self).delete(*args, **kwargs)

    def save(self, *args, **kwargs):
        #self.image_set.zip_state = ImageSet.ZipState.INVALID
        #self.image_set.save(update_fields=('zip_state',))
        super(Image, self).save(*args, **kwargs)


    def save_file(self, path:Path):

        try:
            # check if the file can be opened natively, if not convert it
            try:
                osr = getSlideHandler(str(path))
                self.filename = path.name
                self.save()
                if (osr.nFrames>1):
                    for frame_id in range(osr.nFrames):
                        # save FrameDescription object for each frame
                        FrameDescription.objects.create(
                                Image=self,
                                frame_id=frame_id,
                                file_path=self.filename,
                                description=osr.frame_descriptors[frame_id],                                    
                                frame_type=osr.frame_type,
                        )
                    print('Added',osr.nFrames,'frames')
                    self.frames=osr.nFrames
                    self.defaultFrame = osr.default_frame
                    if openslide.PROPERTY_NAME_OBJECTIVE_POWER in osr.properties:
                        self.objectivePower = osr.properties[openslide.PROPERTY_NAME_OBJECTIVE_POWER]
                    if openslide.PROPERTY_NAME_MPP_X in osr.properties:
                        self.mpp = osr.properties[openslide.PROPERTY_NAME_MPP_X]
                    
            except Exception as e:
                print('Unable to open image with OpenSlide',e)
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
                    self.save() # initially save
                    for frame_id in range(self.frames):
                        height, width = reader.dimensions 
                        np_image = np.array(reader.read_region(location=(0,0), size=(reader.dimensions), level=0, frame=frame_id))[:,:,0]
                        linear = np_image.reshape(height * width * self.channels)
                        vi = pyvips.Image.new_from_memory(np.ascontiguousarray(linear.data), height, width, self.channels, 'uchar')

                        target_file = folder_path / "{}_{}_{}".format(1, frame_id + 1, path.name) #z-axis frame image
                        vi.tiffsave(str(target_file), tile=True, compression='lzw', bigtiff=True, pyramid=True,  tile_width=256, tile_height=256)

                        # save FrameDescription object for each frame
                        FrameDescription.objects.create(
                                Image=self,
                                frame_id=frame_id,
                                file_path=target_file,
                                frame_type=FrameDescription.FrameType.TIMESERIES,
                                description='%.2f s (%d)' % (float(frame_id-1)/float(reader.fps), frame_id)
                        )

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
                elif Path(path).suffix.lower() in [".avi", ".mp4"]:
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
                    self.save() # initially save

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

                        # save FrameDescription object for each frame
                        FrameDescription.objects.create(
                                Image=self,
                                frame_id=frame_id,
                                file_path=target_file,
                                frame_type=FrameDescription.FrameType.TIMESERIES,
                                description='%.2f s (%d)' % ((float(frame_id-1)/cap.get(cv2.CAP_PROP_FPS)), frame_id)
                        )


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

                elif path.suffix.lower().endswith(".tiff") or path.suffix.lower().endswith(".tif"):
                    im = tifffile.imread(str(path))
                    shape = im.shape
                    print('Shape=',shape)

                    image_saved = False
                    if len(shape) >= 3: # possible multi channel or frames
                        #Possible formats (10, 300, 300, 3) (10, 300, 300)
                        if (len(shape) == 4 and shape[-1] in [1, 3, 4]) or len(shape) == 3 and shape[-1] not in [1, 3, 4]: 
                            image_saved = True
                            frames = shape[0]
                            self.frames = frames


                            folder_path = Path(self.image_set.root_path()) / path.stem
                            self.save() # initially save
                            os.makedirs(str(folder_path), exist_ok =True)
                            os.chmod(str(folder_path), 0o777)

                            for frame_id in range(shape[0]):
                                vi = pyvips.Image.new_from_array(im[frame_id])
                                vi = vi.scaleimage()
                                height, width, channels = vi.height, vi.width, vi.bands
                                self.channels = channels

                                target_file = folder_path / "{}_{}_{}".format(1, frame_id + 1, path.name) #z-axis frame image
                                vi.tiffsave(str(target_file), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)

                                # save FrameDescription object for each frame
                                FrameDescription.objects.create(
                                        Image=self,
                                        frame_id=frame_id,
                                        file_path=target_file,
                                        frame_type=FrameDescription.FrameType.ZSTACK,
                                )

                                # save first frame as default file for thumbnail etc.
                                if frame_id == 0:
                                    self.filename = target_file.name

                        if image_saved == False:
                            path = Path(path).with_suffix('.tiff')

                            if old_path == path:
                                path = Path(path).with_suffix('.tif')

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
                elif path.suffix.lower().endswith(".hdf5") :                          
                     with h5py.File(str(path), 'r') as hf:
                         hdf_path = Path(path)
                         key = list(hf.keys())[-1] # Only create overlay for first element in hdf5 file
                         data = hf[key]
                         ndarray_data = np.array(data)
                         scaled_image_data = (ndarray_data * (255 / len(np.unique(ndarray_data)))).astype(np.uint8)
                         colored_image = cv2.applyColorMap(scaled_image_data, cv2.COLORMAP_VIRIDIS)
                         colored_image = cv2.cvtColor(colored_image, cv2.COLOR_BGR2RGB)
                         vi = pyvips.Image.new_from_array(colored_image)
                         path = hdf_path.with_stem(hdf_path.stem + "_{}".format(key)).with_suffix('.tiff')
                         vi.tiffsave(str(path), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)
                         self.filename = path.name
                else:                            
                    path = Path(path).with_suffix('.tiff')

                    vi = pyvips.Image.new_from_file(str(old_path))
                    vi.tiffsave(str(path), tile=True, compression='lzw', bigtiff=True, pyramid=True, tile_width=256, tile_height=256)
                    self.filename = path.name

            osr = getSlideHandler(self.path())
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
        except OSError as e:
            print('error:',e.__class__, str(e))
            logger.error('Error in save_file: '+str(e.__class__)+' - '+str(e))
            if path.exists():
                os.remove(str(path))
            raise

    def __str__(self):
        return u'Image: {0}'.format(self.name)

    def __repr__(self):
        return u'Image: {0}'.format(self.name)

# Image signals for del the cache
@receiver([post_save, post_delete, m2m_changed], sender=Image)
def image_changed_handler(sender, instance, **kwargs):

    # delte cached imageset information used in JS
    if hasattr(cache, "delete_pattern"):
        cache.delete_pattern(f"*/api/v1/images/image_sets/{instance.image_set_id}/*")

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
    show_registration = models.BooleanField(default=False)


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

# ImageSet for del the cache
@receiver([post_save, post_delete, m2m_changed], sender=ImageSet)
def imageset_changed_handler(sender, instance, **kwargs):

    # delte cached imageset information used in JS
    # Currently just Redis is supported
    if hasattr(cache, "delete_pattern"):
        cache.delete_pattern(f"*/api/v1/images/image_sets/{instance.id}/*")

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


def registration_directory_path(instance, filename):
    return f"registration/{instance.source_image.id}_{instance.target_image.id}.pickle"


qt_cache = {}
class ImageRegistration(models.Model):

    class Meta:
        unique_together = [
            'source_image',
            'target_image',
        ]

    source_image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name='source_image')
    target_image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name='target_image')

    transformation_matrix = models.JSONField(null=True)
    registration_error = models.FloatField(default=-1)
    
    runtime = models.IntegerField(default=-1)
    file = models.FileField(upload_to=registration_directory_path, null=True)

    @cached_property
    def rotation_angle(self):

        return - math.atan2(self.transformation_matrix["t_01"], self.transformation_matrix["t_00"]) * 180 / math.pi


    @cached_property
    def inv_matrix(self):

        t = self.transformation_matrix
        H = np.array([[t["t_00"], t["t_01"], t["t_02"]], 
                        [t["t_10"], t["t_11"], t["t_12"]], 
                        [t["t_20"], t["t_21"], t["t_22"]]])


        # Using numpys pseudo-inverse as this is the generalization for singular matrices
        M = np.linalg.pinv(H)

        return {
            "t_00": M [0,0], 
            "t_01": M [0,1],
            "t_02": M [0,2], 

            "t_10": M [1,0],  
            "t_11": M [1,1],
            "t_12": M [1,2],  

            "t_20": M [2,0],              
            "t_21": M [2,1],     
            "t_22": M [2,2], 
        }

    @cached_property
    def get_matrix_without_rotation(self):
        t = self.transformation_matrix
        H = np.array([[t["t_00"], t["t_01"], t["t_02"]], 
                        [t["t_10"], t["t_11"], t["t_12"]], 
                        [t["t_20"], t["t_21"], t["t_22"]]])

        phi = self.rotation_angle * math.pi / 180
        rot = np.array([[np.cos(phi), - np.sin(phi), 0],
                        [np.sin(phi),   np.cos(phi), 0], 
                        [0.         ,             0, 1]])
        

        inv_rot = np.linalg.pinv(rot)

        M = H@inv_rot
        return M


    @property
    def scale_str(self): # get scale as string, used in UI
        M = self.get_matrix_without_rotation
        return '%.2f, %.2f' % (M[0][0],M[1][1])

    @cached_property
    def get_scale(self):

        M = self.get_matrix_without_rotation
        return M[0][0], M[1][1]

    @cached_property
    def get_inv_scale(self):

        M = self.get_matrix_without_rotation
        M = np.linalg.pinv(M)
        return M[0][0], M[1][1]

    def __str__(self):
        return f'Registration: Source: {self.source_image.name} Target: {self.target_image.name} Transformation: {self.transformation_matrix}'

    def perform_registration(self, maxFeatures:int=512, crossCheck:bool=False, flann:bool=False, ratio:float=0.7, use_gray:bool=False, 
                                homography:bool=True, filter_outliner:bool=False, target_depth:int=0,  thumbnail_size:tuple=(2048, 2048), **kwargs):

        import qt_wsi_reg.registration_tree as registration

        parameters = {
                # feature extractor parameters
                "point_extractor": "sift",  #orb , sift
                "maxFeatures": maxFeatures, 
                "crossCheck": crossCheck, 
                "flann": flann,
                "ratio": ratio, 
                "use_gray": use_gray,

                # QTree parameter 
                "homography": homography,
                "filter_outliner": filter_outliner,
                "debug": False,
                "target_depth": target_depth,
                "run_async": False,
                "thumbnail_size": thumbnail_size
            }

        soure_path = self.source_image.path()
        targert_path = self.target_image.path()

        qtree = registration.RegistrationQuadTree(source_slide_path=soure_path, target_slide_path=targert_path, **parameters)
        self.registration_error = qtree.mean_reg_error
        self.runtime = qtree.run_time
        self.transformation_matrix = {"t_00": qtree.get_homography[0][0], "t_01": qtree.get_homography[0][1], "t_02": qtree.get_homography[0][2], 
                                      "t_10": qtree.get_homography[1][0], "t_11": qtree.get_homography[1][1], "t_12": qtree.get_homography[1][2], 
                                      "t_20": qtree.get_homography[2][0], "t_21": qtree.get_homography[2][1], "t_22": qtree.get_homography[2][2]}

        content = pickle.dumps(qtree)
        fid = ContentFile(content)
        self.file.save(f"{self.id}.pickle", fid)

        self.save()

    def create_inverse_registration(self):

        A = np.array([[self.transformation_matrix["t_00"], self.transformation_matrix["t_01"], self.transformation_matrix["t_02"]],
                    [self.transformation_matrix["t_10"], self.transformation_matrix["t_11"], self.transformation_matrix["t_12"]]])

        A_inv = cv2.invertAffineTransform(A)  

        new_transformation_matrix = {
                                        "t_00": A_inv[0,0], 
                                        "t_01": A_inv[0,1],
                                        "t_02": A_inv[0,2], 

                                        "t_10": A_inv[1,0],  
                                        "t_11": A_inv[1,1],
                                        "t_12": A_inv[1,2],  

                                        "t_20": self.transformation_matrix["t_20"],              
                                        "t_21": self.transformation_matrix["t_21"],     
                                        "t_22": self.transformation_matrix["t_22"], 
                                    }

        new_registration = ImageRegistration.objects.create(source_image=self.target_image, target_image=self.source_image, 
                                            registration_error=self.registration_error, runtime=self.runtime, transformation_matrix=new_transformation_matrix)

        new_registration.save()
        return new_registration
    
    def convert_coodinates(self, vector):

        qt = None
        if self.file.name !=  "":
            if self.file.name not in qt_cache:
                qt = pickle.load(open(str(self.file.path), "rb" ))
                qt_cache[self.file.name] = qt
            else:
                qt = qt_cache[self.file.name]

        annos = []
        for i in range(1, (len(vector) // 2) + 1):
            x = vector.get('x' + str(i))
            y = vector.get('y' + str(i))
            w = 0
            h = 0
            annos.append([x, y, w, h])

        
        result_vector = {}
        if qt is not None:
            trans_annos = qt.transform_boxes(annos)

            for id, box in enumerate(trans_annos):
                result_vector[f"x{id+1}"] = box[0]
                result_vector[f"y{id+1}"] = box[1]
        else:
            for id, box in enumerate(annos):
                x,y = box[:2]
                result_vector[f"x{id+1}"] = self.transformation_matrix["t_00"] * x + self.transformation_matrix["t_01"] * y + self.transformation_matrix["t_02"]
                result_vector[f"y{id+1}"] = self.transformation_matrix["t_10"] * x + self.transformation_matrix["t_11"] * y + self.transformation_matrix["t_12"]

        return result_vector