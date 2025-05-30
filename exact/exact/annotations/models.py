import json
import uuid
import datetime
from typing import Set, Union
from enum import Enum, IntEnum

from django.core.cache import cache
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models, connection
from django.db.models import Subquery, F, IntegerField, OuterRef, Count
from django.db.models.functions import Coalesce
from django.utils.functional import cached_property

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save, m2m_changed
from django.dispatch import receiver

from exact.images.models import Image, ImageSet, SetVersion
from exact.users.models import Team
from exact.annotations.fields import NonStrippingTextField
from exact.administration.models import Product

class AnnotationQuerySet(models.QuerySet):
    def annotate_verification_difference(self) -> models.QuerySet:
        return self.annotate(
            positive_verifications_count=Coalesce(Subquery(
                Verification.objects.filter(
                    annotation_id=OuterRef('pk'), verified=True).values(
                    'annotation_id').annotate(
                    count=Count('pk')).values('count'),
                output_field=IntegerField()), 0),
            negative_verifications_count=Coalesce(Subquery(
                Verification.objects.filter(
                    annotation_id=OuterRef('pk'), verified=False).values(
                    'annotation_id').annotate(
                    count=Count('pk')).values('count'),
                output_field=IntegerField()), 0)).annotate(
            verification_difference=F(
                'positive_verifications_count') - F('negative_verifications_count'))

class AnnotationVersion(models.Model):
    class Meta:
        unique_together = [
            'version',
            'annotation',
        ]

    version = models.ForeignKey(SetVersion, on_delete=models.CASCADE)
    annotation = models.ForeignKey('Annotation', on_delete=models.PROTECT)
    image = models.ForeignKey(Image, on_delete=models.CASCADE)
    annotation_type = models.ForeignKey('AnnotationType', on_delete=models.PROTECT)

    deleted = models.BooleanField(default=False)
    vector = models.JSONField(null=True)

    @cached_property
    def has_changes(self):
        return self.annotation_type != self.annotation.annotation_type or self.vector != self.annotation.vector or self.deleted != self.annotation.deleted


class Annotation(models.Model):

    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name='annotations')
    vector = models.JSONField(null=True)
    _concealed = models.BooleanField(default=False)
    _blurred = models.BooleanField(default=False)

    time = models.DateTimeField(auto_now_add=True)

    annotation_type = models.ForeignKey('AnnotationType', on_delete=models.PROTECT)
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                             related_name='creator',
                             on_delete=models.SET_NULL,
                             null=True)
    last_edit_time = models.DateTimeField(auto_now=True)
    last_editor = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='last_editor', null=True,
        on_delete=models.SET_NULL)
    verified_by = models.ManyToManyField(settings.AUTH_USER_MODEL, through='Verification')

    objects = models.Manager.from_queryset(AnnotationQuerySet)()

    deleted = models.BooleanField(default=False)
    description = models.TextField(max_length=1000, blank=True)

    unique_identifier = models.UUIDField(default=uuid.uuid4)

    meta_data = models.JSONField(null=True)

    def __str__(self):
        return 'Annotation: {0} (image: {1}, image set: {2}, team: {3})'.format(self.annotation_type.name, self.image.name, self.image.image_set.name, self.image.image_set.team.name)

    @property
    def concealed(self):
        return self.annotation_type.enable_concealed and self._concealed and not self.not_in_image

    @property
    def generated(self):
        return False

    @property
    def blurred(self):
        return self.annotation_type.enable_blurred and self._blurred and not self.not_in_image

    @cached_property
    def min_x(self):
        min_x = self.image.width
        for item in self.vector.items():
            if item[0][0] == 'x':
                if item[1] < min_x:
                    min_x = item[1]
        return min_x

    @cached_property
    def min_y(self):
        min_y = self.image.height
        for item in self.vector.items():
            if item[0][0] == 'y':
                if item[1] < min_y:
                    min_y = item[1]
        return min_y

    @cached_property
    def max_x(self):
        max_x = -1
        for item in self.vector.items():
            if item[0][0] == 'x':
                if item[1] > max_x:
                        max_x = item[1]
        return max_x

    @cached_property
    def max_y(self):
        max_y = -1
        for item in self.vector.items():
            if item[0][0] == 'y':
                if item[1] > max_y:
                    max_y = item[1]
        return max_y

    @cached_property
    def height(self):
        if len(self.vector) == 4  and 'y2' in self.vector and "y1" in self.vector:
            return self.vector['y2'] - self.vector['y1']
        elif len(self.vector) > 4:
            return max(0, self.max_y - self.min_y)
        return 0

    @cached_property
    def width(self):
        if len(self.vector) == 4 and 'x2' in self.vector and "x1" in self.vector:  # bounding box and line
            return self.vector['x2'] - self.vector['x1']
        elif len(self.vector) > 4:
            return max(0, self.max_x - self.min_x)
        return 0  # pointi, polygon

    @property
    def radius(self):
        return self.diameter / 2

    @cached_property
    def diameter(self):
        if self.annotation_type.vector_type in (
                AnnotationType.VECTOR_TYPE.BOUNDING_BOX,
                AnnotationType.VECTOR_TYPE.POLYGON):
            return (self.height + self.width) / 2
        return 0

    @cached_property
    def center(self):
        xc, yc = 0, 0
        if self.annotation_type.vector_type in (
                AnnotationType.VECTOR_TYPE.BOUNDING_BOX,
                AnnotationType.VECTOR_TYPE.LINE,
                AnnotationType.VECTOR_TYPE.POLYGON):
            yc = self.min_y + (self.height / 2)
            xc = self.min_x + (self.width / 2)
        elif self.annotation_type.vector_type is AnnotationType.VECTOR_TYPE.POINT:
            yc = self.vector['y1']
            xc = self.vector['x1']
        # TODO: Multiline?
        return {'xc': xc, 'yc': yc}

    @property
    def relative_max_x(self):
        return self.max_x / self.image.width

    @property
    def relative_min_x(self):
        return self.min_x / self.image.width

    @property
    def relative_max_y(self):
        return self.max_y / self.image.height

    @property
    def relative_min_y(self):
        return self.min_y / self.image.height

    @property
    def relative_center(self):

        xc_rel = self.center['xc'] / self.image.width
        yc_rel = self.center['yc'] / self.image.height
        return {'xc': xc_rel, 'yc': yc_rel}

    def get_relative_vector_element(self, key):
        if key[0] == 'x':
            return self.vector[key] / float(self.image.width)
        if key[0] == 'y':
            return self.vector[key] / float(self.image.height)
        raise ValueError('wrong key in get_relative_vector_element: {}'.format(key))

    @property
    def relative_width(self):
        rel_width = self.width / self.image.width
        return rel_width

    @property
    def relative_height(self):
        rel_height = self.height / self.image.height
        return rel_height

    @cached_property
    def relative_radius(self):
        rel_rad_w = self.radius / self.image.width
        rel_rad_h = self.radius / self.image.height
        return (rel_rad_h + rel_rad_w) / 2

    @property
    def relative_diameter(self):
        return self.relative_radius * 2

    @property
    def not_in_image(self) -> bool:
        """Check whether the annotated object is not in the image."""
        return not self.vector

    @property
    def content(self):
        if self.not_in_image:
            return 'Not in image'
        return self.vector

    @property
    def vector_as_json(self) -> str:
        return json.dumps(self.vector)

    def owner(self):
        # TODO: maybe use an owner field populated by a database trigger
        return self.last_editor if self.last_editor else self.user

    def verify(self, user: get_user_model(), verified: bool):
        """Add or update a verification for an annotation."""
        if not self.verifications.filter(user=user).update(verified=verified):
            Verification.objects.create(
                annotation=self, user=user, verified=verified)

    @staticmethod
    def equal_annotation(
            vector: Union[dict, None], image: Image,
            annotation_type: 'AnnotationType', user):

        if image.image_set.collaboration_type == ImageSet.CollaborationTypes.COLLABORATIVE:
            return image.annotations.filter(vector=vector, annotation_type_id=annotation_type.id, deleted=False).count() != 0
        elif image.image_set.collaboration_type == ImageSet.CollaborationTypes.COMPETITIVE:
            return image.annotations.filter(vector=vector, annotation_type_id=annotation_type.id, user=user, deleted=False).count() != 0



    @staticmethod
    def similar_annotations(
            vector: Union[dict, None], image: Image,
            annotation_type: 'AnnotationType', max_similarity: int = 5,
            exclude: Union[None, Set[int]] = None) -> bool:
        """
        Test for duplicates of same tag type and similiar coordinates
        (+-5 on every coordinate) on image.

        :param vector: JSON vector to check
        :param annotation_type: type of the annotation of the new vector
        :param max_similarity specifies the maximum pixels each coordinate
            can differ to be regarded as similar.
        :param exclude a set of ids to exclude from checking
        """
        # TODO: Support dynamic VECTOR_TYPEs
        # TODO: Support returning explicit query sets instead of bool
        # (get_similar vectors)

        # check for existing not in image annotations
        if vector is None:
            annotations = image.annotations.all()
            if exclude is not None:
                annotations = annotations.exclude(pk__in=exclude)
            return annotations.filter(
                annotation_type=annotation_type, vector__isnull=True).exists()

        # vector type specific stuff
        if annotation_type.vector_type is AnnotationType.VECTOR_TYPE.BOUNDING_BOX:
            # TODO: make sure, the vector format (point 1 upper left) is consistent
            query = '''
            SELECT
                (1)
            FROM
              {Annotation} a
            WHERE
              a.annotation_type_id=%(annotation_type_id)s AND
              a.image_id=%(image_id)s AND
              (vector->>'x1')::INT BETWEEN %(min_x1)s AND %(max_x1)s AND
              (vector->>'x2')::INT BETWEEN %(min_x2)s AND %(max_x2)s AND
              (vector->>'y1')::INT BETWEEN %(min_y1)s AND %(max_y1)s AND
              (vector->>'y2')::INT BETWEEN %(min_y2)s AND %(max_y2)s
            '''
            query_params = {
                'annotation_type_id': annotation_type.pk,
                'image_id': image.pk,
                'min_x1': vector.get('x1', 0) - max_similarity,
                'max_x1': vector.get('x1', 0) + max_similarity,
                'min_x2': vector.get('x2', 0) - max_similarity,
                'max_x2': vector.get('x2', 0) + max_similarity,
                'min_y1': vector.get('y1', 0) - max_similarity,
                'max_y1': vector.get('y1', 0) + max_similarity,
                'min_y2': vector.get('y2', 0) - max_similarity,
                'max_y2': vector.get('y2', 0) + max_similarity,
            }
            if exclude:
                query += ' AND a.id NOT IN %(exclude)s'
                query_params['exclude'] = tuple(exclude)

            with connection.cursor() as cursor:
                cursor.execute(query.format(**{
                    'Annotation': Annotation._meta.db_table,
                }), query_params)
                return cursor.fetchone() is not None
        if annotation_type.vector_type is AnnotationType.VECTOR_TYPE.LINE:
            # TODO: make sure, the vector format (point 1 left, upper) is consistent
            query = '''
            SELECT
                (1)
            FROM
              {Annotation} a
            WHERE
              a.annotation_type_id=%(annotation_type_id)s AND
              a.image_id=%(image_id)s AND
              (vector->>'x1')::INT BETWEEN %(min_x1)s AND %(max_x1)s AND
              (vector->>'x2')::INT BETWEEN %(min_x2)s AND %(max_x2)s AND
              (vector->>'y1')::INT BETWEEN %(min_y1)s AND %(max_y1)s AND
              (vector->>'y2')::INT BETWEEN %(min_y2)s AND %(max_y2)s
            '''
            query_params = {
                'annotation_type_id': annotation_type.pk,
                'image_id': image.pk,
                'min_x1': vector.get('x1', 0) - max_similarity,
                'max_x1': vector.get('x1', 0) + max_similarity,
                'min_x2': vector.get('x2', 0) - max_similarity,
                'max_x2': vector.get('x2', 0) + max_similarity,
                'min_y1': vector.get('y1', 0) - max_similarity,
                'max_y1': vector.get('y1', 0) + max_similarity,
                'min_y2': vector.get('y2', 0) - max_similarity,
                'max_y2': vector.get('y2', 0) + max_similarity,
            }
            if exclude:
                query += ' AND a.id NOT IN %(exclude)s'
                query_params['exclude'] = tuple(exclude)

            with connection.cursor() as cursor:
                cursor.execute(query.format(**{
                    'Annotation': Annotation._meta.db_table,
                }), query_params)
                return cursor.fetchone() is not None
        elif annotation_type.vector_type is AnnotationType.VECTOR_TYPE.POINT:
            query = '''
            SELECT
                (1)
            FROM
              {Annotation} a
            WHERE
              a.annotation_type_id=%(annotation_type_id)s AND
              a.image_id=%(image_id)s AND
              (vector->>'x1')::INT BETWEEN %(min_x1)s AND %(max_x1)s AND
              (vector->>'y1')::INT BETWEEN %(min_y1)s AND %(max_y1)s
            '''
            query_params = {
                'annotation_type_id': annotation_type.pk,
                'image_id': image.pk,
                'min_x1': vector.get('x1', 0) - max_similarity,
                'max_x1': vector.get('x1', 0) + max_similarity,
                'min_y1': vector.get('y1', 0) - max_similarity,
                'max_y1': vector.get('y1', 0) + max_similarity,
            }
            if exclude:
                query += ' AND a.id NOT IN %(exclude)s'
                query_params['exclude'] = tuple(exclude)

            with connection.cursor() as cursor:
                cursor.execute(query.format(**{
                    'Annotation': Annotation._meta.db_table,
                }), query_params)
                return cursor.fetchone() is not None
        elif annotation_type.vector_type in (AnnotationType.VECTOR_TYPE.POLYGON,
                                             AnnotationType.VECTOR_TYPE.MULTI_LINE):
            # TODO: make sure, the vector format (point 1 left, upper) is consistent
            query = '''
            SELECT
                (1)
            FROM
              {Annotation} a
            WHERE
              a.annotation_type_id=%(annotation_type_id)s AND
              a.image_id=%(image_id)s
            '''
            query_params = {
                'annotation_type_id': annotation_type.pk,
                'image_id': image.pk,
            }
            for i in range(1, (len(vector) // 2) + 1):
                query_params.update({
                    'min_x' + str(i): vector.get('x' + str(i), 0) - max_similarity,
                    'max_x' + str(i): vector.get('x' + str(i), 0) + max_similarity,
                    'min_y' + str(i): vector.get('y' + str(i), 0) - max_similarity,
                    'max_y' + str(i): vector.get('y' + str(i), 0) + max_similarity,
                })
                query += '''
                    AND
                    (vector->>'x{0}')::INT BETWEEN %(min_x{0})s AND %(max_x{0})s AND
                    (vector->>'y{0}')::INT BETWEEN %(min_y{0})s AND %(max_y{0})s
                    '''.format(str(i))
            if exclude:
                query += ' AND a.id NOT IN %(exclude)s'
                query_params['exclude'] = tuple(exclude)

            with connection.cursor() as cursor:
                cursor.execute(query.format(**{
                    'Annotation': Annotation._meta.db_table,
                }), query_params)
                return cursor.fetchone() is not None

        return False

class AnnotationType(models.Model):
    class Meta:
        unique_together = [
            'name',
            'product',
        ]

    class VECTOR_TYPE():
        BOUNDING_BOX = 1
        POINT = 2
        LINE = 3
        MULTI_LINE = 4
        POLYGON = 5
        FIXED_SIZE_BOUNDING_BOX = 6
        GLOBAL = 7 #Annotations without a shape that are valid for the whole image

    name = models.CharField(max_length=50)
    active = models.BooleanField(default=True)
    vector_type = models.IntegerField(default=VECTOR_TYPE.BOUNDING_BOX)
    # Number of required nodes (in polygon and multiline) 0->unspecified
    node_count = models.IntegerField(default=0)
    enable_concealed = models.BooleanField(default=True)
    enable_blurred = models.BooleanField(default=True)
    color_code = models.CharField(default="#CC4444", max_length=7, unique=False)
    default_width = models.IntegerField(default=50, unique=False)
    default_height = models.IntegerField(default=50, unique=False)
    sort_order = models.IntegerField(default=0, unique=False)
    multi_frame = models.BooleanField(default=False)

    image_file = models.ImageField(upload_to='images/', null=True, verbose_name="")

    product = models.ForeignKey(Product, on_delete= models.SET_NULL, null=True)
    closed = models.BooleanField(default=True)
    area_hit_test = models.BooleanField(default=True)

    def __str__(self):
        product_name = "({0})".format(self.product.name) if self.product is not None else ""
        if self.active:
            return u'AnnotationType: {0} {1}'.format(self.name, product_name)
        else:
            return u'[inactive] AnnotationType: {0} {1}'.format(self.name, product_name)

    @staticmethod
    def get_vector_type_name(vector_type):
        if vector_type is AnnotationType.VECTOR_TYPE.BOUNDING_BOX:
            return 'Bounding Box'
        if vector_type is AnnotationType.VECTOR_TYPE.POINT:
            return 'Point'
        if vector_type is AnnotationType.VECTOR_TYPE.LINE:
            return 'Line'
        if vector_type is AnnotationType.VECTOR_TYPE.POLYGON:
            return 'Polygon'
        if vector_type is AnnotationType.VECTOR_TYPE.MULTI_LINE:
            return 'Multi Line'
        if vector_type is AnnotationType.VECTOR_TYPE.FIXED_SIZE_BOUNDING_BOX:
            return 'Fixed Size Bounding Box'

    def validate_vector(self, vector: Union[dict, None]) -> bool:
        """
        Validate a vector. Returns whether the vector is valid.
        Necessary type casts are done in-place within the dictionary.
        """
        if vector is None:
            # not in image
            return True
        if not isinstance(vector, dict):
            return False
        # converting vector elements to integers
        for key, value in vector.items():
            try:
                vector[key] = int(value)
            except ValueError:
                return False
        if self.vector_type == AnnotationType.VECTOR_TYPE.BOUNDING_BOX:
            return self._validate_bounding_box(vector)
        if self.vector_type == AnnotationType.VECTOR_TYPE.LINE:
            return self._validate_line(vector)
        if self.vector_type == AnnotationType.VECTOR_TYPE.POINT:
            return self._validate_point(vector)
        if self.vector_type == AnnotationType.VECTOR_TYPE.POLYGON:
            return self._validate_polygon(vector)
        if self.vector_type == AnnotationType.VECTOR_TYPE.MULTI_LINE:
            return self._validate_multi_line(vector)
        if self.vector_type == AnnotationType.VECTOR_TYPE.FIXED_SIZE_BOUNDING_BOX:
            return self._validate_bounding_box(vector)
        if self.vector_type == AnnotationType.VECTOR_TYPE.GLOBAL:
            return self._validate_bounding_box(vector)

        # No valid vector type given.
        return False

    def _validate_global(self, vector: dict) -> bool:
        return False if vector is not None or len(vector.keys()) > 0 else True

    def _validate_bounding_box(self, vector: dict) -> bool:
        return (
            vector.get('x2', float('-inf')) -
            vector.get('x1', float('inf')) >= 1) and (
            vector.get('y2', float('-inf')) -
            vector.get('y1', float('inf')) >= 1) and \
            len(vector.keys()) == 4

    def _validate_line(self, vector: dict) -> bool:
        return (
            vector.get('x2', float('inf')) is not
            vector.get('x1', float('inf')) or
            vector.get('y2', float('inf')) is not
            vector.get('y1', float('inf')) and
            len(vector.keys()) == 4
        )

    def _validate_point(self, vector: dict) -> bool:
        return 'x1' in vector and 'y1' in vector and len(vector.keys()) == 4

    def _validate_polygon(self, vector: dict) -> bool:
        if len(vector) < 6:
            return False  # A polygon vector has to have at least 3 nodes
        if not (self.node_count == 0 or
                self.node_count == int(len(vector) // 2)):
            return False
        return True

    def _validate_multi_line(self, vector: dict) -> bool:
        if len(vector) < 4:
            return False  # A multi line vector has to have at least 2 nodes
        if not (self.node_count == 0 or
                self.node_count == int(len(vector) // 2)):
            return False
        return True

# Annotation types signals for del the cache
@receiver([post_save, post_delete], sender=AnnotationType)
def annotation_type_changed_handler(sender, instance, **kwargs):
    # delte cached imageset information used in JS
    if hasattr(cache, "delete_pattern"):
        for image_set in instance.product.imagesets.all():
            cache.delete_pattern(f"*/api/v1/images/image_sets/{image_set.id}/*")


class Export(models.Model):
    time = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                             on_delete=models.SET_NULL,
                             null=True,
                             blank=True)
    image_set = models.ForeignKey(ImageSet,
                                  on_delete=models.CASCADE)
    annotation_count = models.IntegerField(default=0)
    export_text = models.TextField(default='')
    filename = models.TextField(default='')
    format = models.ForeignKey('ExportFormat',
                               on_delete=models.SET_NULL,
                               null=True,
                               related_name='exports')

    def __str__(self):
        return u'Export: {0}({1})'.format(self.id, self.filename)

    @property
    def deprecated(self):
        return self.format is None or self.time < self.format.last_change_time

class Verification(models.Model):
    class Meta:
        unique_together = [
            'annotation',
            'user',
        ]

    annotation = models.ForeignKey(
        Annotation, on_delete=models.CASCADE, related_name='verifications')
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                             on_delete=models.SET_NULL,
                             null=True)
    time = models.DateTimeField(auto_now_add=True)
    verified = models.BooleanField(default=0)


class ExportFormat(models.Model):
    name = models.CharField(max_length=20, unique=True)
    last_change_time = models.DateTimeField(auto_now=True)
    annotations_types = models.ManyToManyField(AnnotationType)
    team = models.ForeignKey(Team, on_delete=models.PROTECT,
                             related_name='export_formats')
    public = models.BooleanField(default=False)
    base_format = NonStrippingTextField(default='%%content')  # more general, has a placeholder for the list of annotation_formats, can contain header, footer etc.
    image_format = NonStrippingTextField(null=True, blank=True, default=None)
    annotation_format = NonStrippingTextField(default='%%imagename|%%type|{%%vector}|')  # used for every annotation in export (coordinates, type, image)
    vector_format = NonStrippingTextField(default=r'"x%%count1": %%x,"y%%count1": %%y,')
    not_in_image_format = NonStrippingTextField(default='image name|annotation type|not in image')
    name_format = models.CharField(default='export_%%exportid.txt', max_length=200)
    min_verifications = models.IntegerField(default=0)
    image_aggregation = models.BooleanField(default=False)
    include_blurred = models.BooleanField(default=True)
    include_concealed = models.BooleanField(default=True)

    def __str__(self):
        return '{}: {}'.format(self.team.name, self.name)


class LogImageAction(models.Model):
    class ActionType(IntEnum):
        OPEN = 1
        CLOSED = 2

    image = models.ForeignKey(Image, on_delete=models.CASCADE, null=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                                 on_delete=models.SET_NULL,
                                 null=True)
    time = models.DateTimeField(auto_now=True)

    action = models.IntegerField(default=1)

    ip = models.GenericIPAddressField(null=True)

    @staticmethod
    def get_ip_fom_request(request):

        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip


def annotation_directory_path(instance, filename):
    now = datetime.datetime.now()
    return 'annotation/{0}/{1}/{2}/{3}/{4}/{5}'.format(now.year, now.month, now.day, now.hour, instance.annotation.id, filename)

class AnnotationMediaFile(models.Model):

    class Meta:
        unique_together = [
            'name',
            'annotation',
        ]

    class MediaFileType(IntEnum):
        Undefined = 1
        Image = 2
        Video = 3
        Audio = 4


    name = models.CharField(max_length=255)
    file = models.FileField(upload_to=annotation_directory_path, null=True)

    media_file_type = models.IntegerField(default=MediaFileType.Image)

    annotation = models.ForeignKey(Annotation, on_delete=models.CASCADE, related_name="uploaded_media_files",
        related_query_name="uploaded_media_file")

    def __str__(self):
        return self.name + ": " + str(self.file)