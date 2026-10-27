from django.conf import settings
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from exact.images.models import Image, ImageRegistration, ImageSet
from exact.users.models import Team, TeamMembership, User


class ImageSetOverviewQueriesTest(TestCase):
    """The image set overview must not need more queries for more images, uploaders or registrations."""

    def setUp(self):
        self.user = User.objects.create_user('u', 'u@example.com', 'pw')
        self.team = Team.objects.create(name='t')
        TeamMembership.objects.create(team=self.team, user=self.user, is_admin=True)
        self.image_set = ImageSet.objects.create(name='s', team=self.team, creator=self.user)
        self.uploaders = [User.objects.create_user('uploader%d' % i, 'x%d@example.com' % i, 'pw') for i in range(8)]
        self.client.force_login(self.user, backend=settings.AUTHENTICATION_BACKENDS[-1])
        self.images = []

    def add_images(self, count):
        for _ in range(count):
            n = len(self.images)
            self.images.append(Image.objects.create(
                name='i%d.png' % n, filename='i%d.png' % n, image_set=self.image_set, width=10, height=10,
                creator=self.uploaders[n % len(self.uploaders)]))

    def overview(self):
        url = reverse('images:view_imageset', args=(self.image_set.id,))
        self.client.get(url)       # warm up caches (content types, ...)
        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        return len(captured), response

    def test_queries_do_not_grow_with_the_number_of_images_and_registrations(self):
        self.add_images(3)
        few, _ = self.overview()
        self.add_images(12)
        for target in self.images[1:]:
            ImageRegistration.objects.create(
                source_image=self.images[0], target_image=target, registration_points=[],
                transformation_matrix={'t_%d%d' % (r, c): float(r == c) for r in range(3) for c in range(3)})  # identity
        many, response = self.overview()
        self.assertEqual(few, many, '%d queries for 3 images, %d for 15 images with 14 registrations' % (few, many))
        self.assertContains(response, 'i14.png')
        self.assertContains(response, 'uploader')
