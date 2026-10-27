from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from exact.administration.models import Product
from exact.annotations.models import (Annotation, AnnotationMediaFile, AnnotationType, AnnotationVersion,
                                      Verification)
from exact.images.models import FrameDescription, Image, ImageSet, SetVersion
from exact.users.models import Team, TeamMembership, User


class ApiQueryCountTest(TestCase):
    """
    The number of queries of list responses must not grow with the number of rows (they used to need one or
    more queries per image/annotation), and the prefetching must not change the content of the responses.
    """

    def setUp(self):
        self.user = User.objects.create_superuser('u', 'u@example.com', 'pw')
        self.other_user = User.objects.create_user('o', 'o@example.com', 'pw')
        team = Team.objects.create(name='t')
        for user in (self.user, self.other_user):
            TeamMembership.objects.create(team=team, user=user, is_admin=True)
        self.image_set = ImageSet.objects.create(name='s', team=team, creator=self.user)
        product = Product.objects.create(name='p', team=team)
        product.imagesets.add(self.image_set)
        self.annotation_type = AnnotationType.objects.create(name='a', product=product)
        self.version = SetVersion.objects.create(name='v')
        self.version.imagesets.add(self.image_set)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def add_image_with_annotation(self, index, verified_by=()):
        image = Image.objects.create(name='i%d.png' % index, filename='i%d.png' % index, image_set=self.image_set)
        for frame in range(2):
            FrameDescription.objects.create(Image=image, description='frame %d' % frame, frame_id=frame)
        annotation = Annotation.objects.create(image=image, annotation_type=self.annotation_type, user=self.user,
                                               vector={'x1': 1, 'y1': 1, 'x2': 5, 'y2': 5})
        AnnotationMediaFile.objects.create(annotation=annotation, name='m%d' % index)
        AnnotationVersion.objects.create(version=self.version, annotation=annotation, image=image,
                                         annotation_type=self.annotation_type, vector=annotation.vector)
        for user in verified_by:
            Verification.objects.create(annotation=annotation, user=user, verified=True)
        return image, annotation

    def queries(self, url):
        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.content[:300])
        return len(captured), response.json()

    def assert_constant_queries(self, url):
        for i in range(3):
            self.add_image_with_annotation(i)
        few, _ = self.queries(url)
        for i in range(3, 15):
            self.add_image_with_annotation(i)
        many, data = self.queries(url)
        self.assertEqual(few, many, '%s needs %d queries for 3 rows but %d for 15 rows' % (url, few, many))
        return data

    def test_images(self):
        data = self.assert_constant_queries('/api/v1/images/images/')
        self.assertEqual(data['count'], 15)
        self.assertEqual(len(data['results'][0]['FrameDescriptions']), 2)
        self.assertEqual(len(data['results'][0]['annotations']), 1)

    def test_images_without_the_relations(self):
        self.assert_constant_queries('/api/v1/images/images/?omit=annotations,FrameDescriptions')

    def test_image_set_with_images_as_used_by_the_annotation_page(self):
        data = self.assert_constant_queries(
            '/api/v1/images/image_sets/%d/?expand=images,images.FrameDescriptions&omit=images.annotations'
            % self.image_set.id)
        self.assertEqual(len(data['images']), 15)
        self.assertEqual(len(data['images'][0]['FrameDescriptions']), 2)
        self.assertNotIn('annotations', data['images'][0])

    def test_image_sets_list(self):
        data = self.assert_constant_queries('/api/v1/images/image_sets/')
        self.assertEqual(len(data['results'][0]['images']), 15)

    def test_annotations(self):
        data = self.assert_constant_queries('/api/v1/annotations/annotations/')
        first = data['results'][0]
        self.assertEqual(len(first['uploaded_media_files']), 1)
        self.assertEqual(len(first['annotationversion_set']), 1)

    def test_annotations_as_requested_by_the_viewer(self):
        self.assert_constant_queries(
            '/api/v1/annotations/annotations/?limit=50&expand=user,last_editor,uploaded_media_files'
            '&fields=image,annotation_type,id,vector,verified_by_user,uploaded_media_files,user.id,user.username')

    def test_verified_by_user_only_counts_verifications_of_the_user(self):
        _, mine = self.add_image_with_annotation(0, verified_by=[self.user])
        _, theirs = self.add_image_with_annotation(1, verified_by=[self.other_user])
        _, nobody = self.add_image_with_annotation(2)
        Verification.objects.create(annotation=nobody, user=self.user, verified=False)      # not verified

        _, data = self.queries('/api/v1/annotations/annotations/')
        verified = {row['id']: row['verified_by_user'] for row in data['results']}
        self.assertEqual(verified, {mine.id: True, theirs.id: False, nobody.id: False})
