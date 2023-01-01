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
    id = models.AutoField(primary_key=True)
    # Class for external plugins (run on server or whereever else)
    name = models.CharField(max_length=200)
    author = models.CharField(max_length=200)
    contact = models.EmailField(max_length=80)
    abouturl = models.URLField(max_length=80)
    icon = models.ImageField(upload_to=plugins_directory)
    products = models.ManyToManyField(Product, related_name="plugins")

    def __str__(self):
        return u'Plugin: {0}'.format(self.name)


def plugin_bitmap_directory(inst:"PluginResultBitmap", filename):
    return 'plugins/{0}_{1}/{2}/{3}'.format(inst.pluginresultentry.pluginresult.plugin.name, inst.pluginresultentry.pluginresult.plugin.id, inst.pluginresultentry.pluginresult.image.id,  filename)


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
    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="pluginJobs")

    def __str__(self):
        return u'Process {0} with {1} ({2:02} %)'.format(self.image.__str__(),self.plugin.name, self.processing_complete*100)



class PluginResult(models.Model):
    id = models.AutoField(primary_key=True)
    plugin = models.ForeignKey(
        Plugin, on_delete=models.CASCADE, related_name="results"
    )
    job = models.OneToOneField(
        PluginJob, on_delete=models.SET_NULL, null=True, related_name="result", 
    )
    created_time = models.DateTimeField(default=datetime.now)
    completed_time = models.DateTimeField(default=datetime.now)
    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="pluginResults")

 
    
class PluginResultEntry(models.Model):
    id = models.AutoField(primary_key=True)    
    # meta class for results
    pluginresult = models.ForeignKey(
        PluginResult, on_delete=models.CASCADE, related_name="entries"
    )
    name = models.CharField(max_length=200)
    visible = models.BooleanField(default=True)
    created_time = models.DateTimeField(default=datetime.now)



class PluginResultBitmap(models.Model):
    id = models.AutoField(primary_key=True)
    question_text = models.CharField(max_length=200)
    scale_min = models.FloatField(default=0)
    scale_max = models.FloatField(default=1)
    name = models.CharField(max_length=200)
    default_threshold = models.FloatField(default=0) # default threshold
    default_alpha = models.FloatField(default=1) # default alpha channel (opacity)
    channels = models.IntegerField(default=1) # RGB=3 channels, heatmap = 1 channel
    transformation_matrix = models.JSONField(null=True)
    meta_data = models.JSONField(null=True)
    bitmap=models.FileField(upload_to=plugin_bitmap_directory)
    pluginresultentry = models.ForeignKey(
        PluginResultEntry, on_delete=models.CASCADE, related_name='bitmap_results')

class PluginResultAnnotation(models.Model):
    id = models.AutoField(primary_key=True)
    annotationtype = models.ForeignKey(AnnotationType, on_delete=models.PROTECT)
    vector = models.JSONField(null=True)
    time = models.DateTimeField(auto_now_add=True)
    meta_data = models.JSONField(null=True)
    pluginresultentry = models.ForeignKey(
        PluginResultEntry, on_delete=models.CASCADE, related_name='annotation_results')
