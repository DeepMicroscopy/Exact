import os
import tempfile

from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image as PILImage
from rest_framework.test import APIClient

from exact.administration.models import Product
from exact.images.models import Image, ImageSet
from exact.users.models import PersonalAccessToken, Team, TeamMembership, User
from exact.users.tokens import generate_pat, hash_token


class CropSourceTest(TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        override = override_settings(IMAGE_PATH=tmp.name)
        override.enable()
        self.addCleanup(override.disable)

        self.user = User.objects.create_superuser('u', 'u@example.com', 'pw')
        self.team = Team.objects.create(name='t')
        TeamMembership.objects.create(team=self.team, user=self.user, is_admin=True)
        self.source_set = ImageSet.objects.create(name='sources', team=self.team, creator=self.user)
        self.source_set.create_folder()
        self.crop_set = ImageSet.objects.create(name='crops', team=self.team, creator=self.user)
        self.crop_set.create_folder()

        self.source = Image.objects.create(name='slide.png', filename='slide.png', image_set=self.source_set,
                                           width=200, height=100, mpp=0.5)
        PILImage.new('RGB', (200, 100), (10, 120, 30)).save(self.source.path(), format='PNG')

        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def crop_url(self, x=20, y=10, z=0, w=64, h=32, target=None):
        return '/images/api/image/crop/%d/%d/%d/%d/%d/%d/%d/' % (
            self.source.id, x, y, z, w, h, (target or self.crop_set).id)

    def test_crop_remembers_where_it_comes_from(self):
        r = self.client.get(self.crop_url())
        self.assertEqual(r.status_code, 201, r.content[:300])
        crop = Image.objects.get(id=r.data['id'])
        self.assertEqual(crop.crop_source_id, self.source.id)
        self.assertEqual((crop.crop_x, crop.crop_y, crop.crop_frame), (20, 10, 0))
        self.assertEqual(crop.crop_region, (20, 10, 20 + 64, 10 + 32))
        self.assertEqual(r.data['crop_source'], self.source.id)
        self.assertEqual((r.data['crop_x'], r.data['crop_y'], r.data['crop_frame']), (20, 10, 0))
        self.assertEqual(list(self.source.crops.all()), [crop])

    def test_images_that_are_no_crops(self):
        self.assertIsNone(self.source.crop_region)
        self.assertEqual(self.client.get('/api/v1/images/images/%d/' % self.source.id).data['crop_source'], None)

    def test_read_only_tokens_can_not_create_crops(self):
        token, prefix = generate_pat()
        PersonalAccessToken.objects.create(user=self.user, name='ro', prefix=prefix,
                                           token_hash=hash_token(token), read_only=True)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION='Bearer ' + token)
        self.assertEqual(c.get(self.crop_url()).status_code, 403)
        self.assertFalse(Image.objects.filter(crop_source=self.source).exists())

    def test_deleting_the_source_keeps_the_crop(self):
        crop = Image.objects.get(id=self.client.get(self.crop_url()).data['id'])
        self.source.delete()
        crop.refresh_from_db()
        self.assertIsNone(crop.crop_source)

    def test_api_links_only_to_readable_sources(self):
        crop = Image.objects.create(name='c.png', filename='c.png', image_set=self.crop_set, width=10, height=10)
        r = self.client.patch('/api/v1/images/images/%d/' % crop.id,
                              {'crop_source': self.source.id, 'crop_x': 3, 'crop_y': 4}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        crop.refresh_from_db()
        self.assertEqual(crop.crop_source_id, self.source.id)

        self.assertEqual(self.client.patch('/api/v1/images/images/%d/' % crop.id, {'crop_source': crop.id},
                                           format='json').status_code, 400)

        stranger = User.objects.create_user('stranger', 's@example.com', 'pw')
        foreign = Image.objects.create(name='f.png', filename='f.png', width=10, height=10,
                                       image_set=ImageSet.objects.create(name='x', team=Team.objects.create(name='x'),
                                                                         creator=stranger))
        self.assertEqual(self.client.patch('/api/v1/images/images/%d/' % crop.id, {'crop_source': foreign.id},
                                           format='json').status_code, 400)


class SourceLinkTest(TestCase):
    """The annotation page of a crop links to the source image, zoomed to the region of the crop."""

    def setUp(self):
        self.user = User.objects.create_user('u', 'u@example.com', 'pw')
        self.team = Team.objects.create(name='t')
        TeamMembership.objects.create(team=self.team, user=self.user, is_admin=True)
        image_set = ImageSet.objects.create(name='s', team=self.team, creator=self.user)
        self.source = Image.objects.create(name='slide.svs', filename='slide.svs', image_set=image_set,
                                           width=5000, height=4000)
        self.crop = Image.objects.create(name='crop.tiff', filename='crop.tiff', image_set=image_set, width=300,
                                         height=200, crop_source=self.source, crop_x=1000, crop_y=2000, crop_frame=3)
        self.client.force_login(self.user, backend=settings.AUTHENTICATION_BACKENDS[-1])

    def page(self, image):
        return self.client.get(reverse('annotations:annotate', args=(image.id,)))

    def test_link_zooms_to_the_cropped_region(self):
        response = self.page(self.crop)
        self.assertEqual(response.status_code, 200)
        link = response.context['source_link']
        self.assertEqual(link['name'], 'slide.svs')
        self.assertTrue(link['url'].startswith(reverse('annotations:annotate', args=(self.source.id,)) + '?'))
        for part in ('frame=3', 'xmin=1000', 'ymin=2000', 'xmax=1300', 'ymax=2200'):
            self.assertIn(part, link['url'])
        self.assertContains(response, 'id="source-image-link"')

    def test_no_link_for_normal_images(self):
        response = self.page(self.source)
        self.assertIsNone(response.context['source_link'])
        self.assertNotContains(response, 'source-image-link')

    def test_no_link_if_the_source_is_not_readable(self):
        stranger = User.objects.create_user('stranger', 's@example.com', 'pw')
        other = ImageSet.objects.create(name='o', team=Team.objects.create(name='o'), creator=stranger)
        self.source.image_set = other
        self.source.save()
        response = self.page(self.crop)
        self.assertIsNone(response.context['source_link'])

    def test_link_without_position_only_opens_the_source(self):
        self.crop.crop_x = self.crop.crop_y = self.crop.crop_frame = None
        self.crop.save()
        link = self.page(self.crop).context['source_link']
        self.assertNotIn('?', link['url'])
