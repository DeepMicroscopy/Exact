from typing import Set

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.postgres.fields import JSONField
from django.db import models

from django.db.models import Count, Q, Sum
from django.db.models.expressions import F

import os

from exact.users.models import Team


class Image(models.Model):
    image_set = models.ForeignKey(
        'ImageSet', on_delete=models.CASCADE, related_name='images')
    name = models.CharField(max_length=100)
    filename = models.CharField(max_length=100)
    time = models.DateTimeField(auto_now_add=True)
    checksum = models.BinaryField()
    mpp = models.FloatField(default=0)
    objectivePower = models.FloatField(default=1)
    width = models.IntegerField(default=800)
    height = models.IntegerField(default=600)

    def path(self):
        return os.path.join(self.image_set.root_path(), self.filename)

    def relative_path(self):
        return os.path.join(self.image_set.path, self.filename)

    def delete(self, *args, **kwargs):
        self.image_set.zip_state = ImageSet.ZipState.INVALID
        self.image_set.save(update_fields=('zip_state',))
        super(Image, self).delete(*args, **kwargs)

    def save(self, *args, **kwargs):
        self.image_set.zip_state = ImageSet.ZipState.INVALID
        self.image_set.save(update_fields=('zip_state',))
        super(Image, self).save(*args, **kwargs)

    def __str__(self):
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

    path = models.CharField(max_length=100, unique=True, null=True)
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=100, null=True, blank=True)
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
        if self.priority is -1:
            return '<span class="glyphicon glyphicon-download" data-toggle="tooltip" data-placement="right" title="Low labeling priority"></span>'
        elif self.priority is 0:
            return ''
        elif self.priority is 1:
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

    screening_tiles = JSONField(null=True)

    x_steps = models.IntegerField(default=0)
    y_steps = models.IntegerField(default=0)

    x_resolution = models.IntegerField(default=0)
    y_resolution = models.IntegerField(default=0)

    current_index = models.IntegerField(default=0)