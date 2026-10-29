from typing import Set

from django.db import connection
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
import uuid

from django.db.models import Count, Q, Sum
from django.db.models.expressions import F

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save, m2m_changed
from django.dispatch import receiver
from django.utils.functional import cached_property
from datetime import datetime
import json

from exact.users.models import Team
from exact.images.models import ImageSet, Image
from exact.administration.models import Product
from exact.annotations.models import AnnotationType

from django.db import models

def plugins_directory(inst, filename):
    return 'plugins/{0}_{1}/{2}'.format(inst.name, inst.id, filename)

class Plugin(models.Model):
    class Meta:
        permissions = [
                    ("use_server_side_plugins", "User can use server-side plugins"),
                ]        

    class PluginType:
        IMAGE_ANALYSIS = 1  # a job analyses one image and produces a PluginResult (heatmaps, annotations)
        REGISTRATION = 2    # a job registers `images[0]` onto `images[1]` and produces an ImageRegistration

    PLUGIN_TYPE_CHOICES = (
        (PluginType.IMAGE_ANALYSIS, 'Image analysis'),
        (PluginType.REGISTRATION, 'Registration'),
    )

    id = models.AutoField(primary_key=True)
    # Class for external plugins (run on server or whereever else)
    name = models.CharField(max_length=200)
    author = models.CharField(max_length=200)
    package = models.CharField(max_length=200, default='') 
    contact = models.EmailField(max_length=80)
    abouturl = models.URLField(max_length=80)
    icon = models.ImageField(upload_to=plugins_directory)
    products = models.ManyToManyField(Product, related_name="plugins", blank=True)
    plugin_type = models.SmallIntegerField(choices=PLUGIN_TYPE_CHOICES, default=PluginType.IMAGE_ANALYSIS)
    # The parameters a job of this plugin accepts, so that a UI can offer a form for them:
    # [{"name": "maxFeatures", "type": "int"|"float"|"bool"|"text"|"choice", "label": ..., "default": ..., "min": ..., "max": ...,
    #   "step": ..., "choices": [...], "help": ...}, ...]
    parameters_schema = models.JSONField(null=True, blank=True)

    def __str__(self):
        return u'Plugin: {0}'.format(self.name)
    
        

def plugin_bitmap_directory(inst:"PluginResultBitmap", filename):
    return 'plugins/{0}_{1}/{2}/{3}'.format(inst.pluginresultentry.pluginresult.plugin.name, inst.pluginresultentry.pluginresult.plugin.id, 
                                            inst.pluginresultentry.pluginresult.image.id,  filename)


PARAMETERS_HELP = (
    "The values of the parameters of the plugin (see Plugin.parameters_schema) for this job, as {name: value}. Any algorithm "
    "(image analysis or registration) can take parameters; names that are not in the schema are ignored by the plugin, "
    "missing ones fall back to the default of the schema."
)


class PluginJob(models.Model):
    id = models.AutoField(primary_key=True)
    processing_complete = models.FloatField(default=0.0)
    plugin = models.ForeignKey(
        Plugin, on_delete=models.CASCADE, related_name="jobs"
    )
    creator = models.ForeignKey(settings.AUTH_USER_MODEL,
                                    default=None,
                                    on_delete=models.SET_NULL,
                                    null=True,
                                    blank=True)
    created_time = models.DateTimeField(default=datetime.now)
    updated_time = models.DateTimeField(default=datetime.now)
    eta_time = models.DateTimeField(default=datetime.now)
    error_message = models.TextField(null=True, blank=True)
    error_detail = models.TextField(null=True, blank=True)
    attached_worker = models.CharField(max_length=200, null=True, blank=True)
    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="pluginJobs")
    # All images the job concerns, in order (see PluginJobImage). `image` stays the first / main one (what existing clients,
    # permissions and the job lists use); a job of a single image has no rows here and concerns [image]. A registration job
    # has two: the image that is registered and the image it is registered onto. The outcome of a registration is an
    # ImageRegistration of the pair (created, or overwriting the existing one), not stored on the job.
    images = models.ManyToManyField(Image, through='PluginJobImage', related_name="pluginJobsInvolved", blank=True)
    # The values of the plugin's `parameters_schema` for this job, {name: value}. Any algorithm (analysis or registration) can
    # take parameters; missing ones fall back to the default of the schema.
    parameters = models.JSONField(null=True, blank=True, help_text=PARAMETERS_HELP)

    def __str__(self):
        return u'Process {0} with {1} ({2:02} %)'.format(self.image.__str__(),self.plugin.name, self.processing_complete)



class PluginJobImage(models.Model):
    """One image of a job, at `position` (0 is the main image, i.e. `PluginJob.image`)."""
    class Meta:
        unique_together = (('job', 'position'),)
        ordering = ['job_id', 'position']

    job = models.ForeignKey(PluginJob, on_delete=models.CASCADE, related_name="job_images")
    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="+")
    position = models.SmallIntegerField(default=0)


class PluginResult(models.Model):
    class Meta:
        permissions = [
                    ("delete_plugin_results", "User can delete plugin results"),
                ]        
    id = models.AutoField(primary_key=True)
    plugin = models.ForeignKey(
        Plugin, on_delete=models.CASCADE, related_name="results"
    )
    job = models.OneToOneField(
        PluginJob, on_delete=models.SET_NULL, null=True, blank=True, related_name="result", 
    )
    created_time = models.DateTimeField(default=datetime.now)
    completed_time = models.DateTimeField(default=datetime.now)
    default_alpha = models.FloatField(default=1.0)
    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="pluginResults")

    def __str__(self):
        return u'PluginResult of {0}'.format(self.job.__str__())

 
    
class PluginResultEntry(models.Model):
    id = models.AutoField(primary_key=True)    
    # meta class for results
    pluginresult = models.ForeignKey(
        PluginResult, on_delete=models.CASCADE, related_name="entries"
    )
    default_threshold = models.FloatField(default=0.0)
    name = models.CharField(max_length=200)
    visible = models.BooleanField(default=True)
    created_time = models.DateTimeField(default=datetime.now)

    def __str__(self):
        return u'PluginResultEntry {0} of {1}'.format(self.name, self.pluginresult.__str__())


def default_rect():
    return { "x": 0,"y": 0,"w": 10000,"h": 10000 }


class PluginResultBitmap(models.Model):
    id = models.AutoField(primary_key=True)
    scale_min = models.FloatField(default=0)
    scale_max = models.FloatField(default=1)
    name = models.CharField(max_length=200)
    default_threshold = models.FloatField(default=0) # default threshold
    default_alpha = models.FloatField(default=1) # default alpha channel (opacity)
    channels = models.IntegerField(default=1) # RGB=3 channels, heatmap = 1 channel
    location_rect = models.JSONField(null=True, default=default_rect) # location of the image, in original image coordinates, including width and height
    frame = models.IntegerField(default=1) # frame (in multi-frame objects)
    meta_data = models.JSONField(null=True, blank=True)
    image = models.ForeignKey(Image, on_delete=models.CASCADE)
    bitmap=models.FileField(upload_to=plugin_bitmap_directory)
    pluginresultentry = models.ForeignKey(
        PluginResultEntry, on_delete=models.CASCADE, related_name='bitmap_results')

    @property
    def plugin(self):
        return self.pluginresultentry.pluginresult.plugin.id

class PluginResultAnnotation(models.Model):
    id = models.AutoField(primary_key=True)
    annotation_type = models.ForeignKey(AnnotationType, on_delete=models.PROTECT)
    vector = models.JSONField(null=True)
    score = models.FloatField(null=True, default=0)
    time = models.DateTimeField(auto_now_add=True)
    meta_data = models.JSONField(null=True)
    description = models.TextField(max_length=1000, blank=True)
    unique_identifier = models.UUIDField(default=uuid.uuid4)
    image = models.ForeignKey(Image, on_delete=models.CASCADE)
    pluginresultentry = models.ForeignKey(
        PluginResultEntry, on_delete=models.CASCADE, related_name='annotation_results')

    @property
    def generated(self):
        return True

    @property
    def plugin(self):
        return self.pluginresultentry.pluginresult.plugin.id

    @property
    def user(self):
        return None
    
    @property
    def last_editor(self):
        return None


