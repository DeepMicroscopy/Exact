from typing import Set

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.core.cache import cache
import os

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save, m2m_changed, pre_delete
from django.dispatch import receiver

from exact.users.models import Team
from exact.images.models import ImageSet

class Product(models.Model):
    class Meta:
        unique_together = [
            'name',
            'team',
        ]

    name = models.CharField(max_length=100)
    description = models.TextField(max_length=1000, null=True, blank=True)
    time = models.DateTimeField(auto_now_add=True)
    team = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        #related_name='image_sets',
        null=True,
    )
    creator = models.ForeignKey(settings.AUTH_USER_MODEL,
                                default=None,
                                on_delete=models.SET_NULL,
                                null=True,
                                blank=True)

    imagesets = models.ManyToManyField(ImageSet)

    def __str__(self):
        return u'Product: {0} [{1}]'.format(self.name, "; ".join(self.annotationtype_set.values_list('name', flat=True)))

# Image signals for del the cache
@receiver([post_save, post_delete], sender=Product)
def product_changed_handler(sender, instance, **kwargs):
    # delte cached imageset information used in JS
    for image_set in instance.imagesets.all():
        cache.delete_pattern(f"*/api/v1/images/image_sets/{image_set.id}/*")

m2m_changed.connect(product_changed_handler, sender=Product.imagesets.through)