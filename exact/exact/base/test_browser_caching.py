import os
import runpy
import tempfile
from unittest import mock

from django.conf import settings
from django.db import connection
from django.test import Client, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from PIL import Image as PILImage
from rest_framework.test import APIClient

from exact.images.models import Image, ImageSet
from exact.users.models import PersonalAccessToken, Team, TeamMembership, User
from exact.users.tokens import generate_pat, hash_token


class ImageResponsesTest(TestCase):
    """Tiles and thumbnails are cacheable by the browser, for team restricted tokens as well."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        override = override_settings(IMAGE_PATH=tmp.name)
        override.enable()
        self.addCleanup(override.disable)

        self.user = User.objects.create_superuser('u', 'u@example.com', 'pw')
        self.team = Team.objects.create(name='t')
        self.other_team = Team.objects.create(name='other')
        for team in (self.team, self.other_team):
            TeamMembership.objects.create(team=team, user=self.user, is_admin=True)
        self.image = self.make_image(self.team)
        self.other_image = self.make_image(self.other_team)

        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def make_image(self, team):
        image_set = ImageSet.objects.create(name='s-' + team.name, team=team, creator=self.user)
        image_set.create_folder()
        image = Image.objects.create(name='i.png', filename='i.png', image_set=image_set, width=64, height=64)
        PILImage.new('RGB', (64, 64), (10, 120, 30)).save(image.path(), format='PNG')
        return image

    def token_client(self, teams):
        token, prefix = generate_pat()
        pat = PersonalAccessToken.objects.create(user=self.user, name='t', prefix=prefix,
                                                 token_hash=hash_token(token), read_only=True)
        pat.teams.set(teams)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION='Bearer ' + token)
        return client

    def tile_url(self, image):
        return '/api/v1/images/images/%d/1/0/tile_files/6/0_0.jpeg/' % image.id

    def test_api_tile_works_for_session_users_and_team_restricted_tokens(self):
        # (this endpoint failed with a NameError for every request after the team restriction was introduced)
        self.assertEqual(self.client.get(self.tile_url(self.image)).status_code, 200)

        token_client = self.token_client([self.team])
        response = token_client.get(self.tile_url(self.image))
        self.assertEqual(response.status_code, 200, response.content[:200])
        self.assertTrue(response.content.startswith(b'\xff\xd8'))            # a jpeg
        self.assertEqual(token_client.get(self.tile_url(self.other_image)).status_code, 404)

    def test_tiles_and_thumbnails_can_be_cached_by_the_browser(self):
        session_client = Client()             # the tile view of the browser viewer uses the login session
        session_client.force_login(self.user, backend=settings.AUTHENTICATION_BACKENDS[-1])
        requests = [(self.client, self.tile_url(self.image)),
                    (self.client, '/api/v1/images/images/%d/thumbnail/' % self.image.id),
                    (session_client, '/images/image/%d/1/0/tile_files/6/0_0.jpeg' % self.image.id)]
        for client, url in requests:
            for attempt in range(2):          # the second request is served from the server's cache
                response = client.get(url)
                self.assertEqual(response.status_code, 200, (url, response.content[:200]))
                self.assertEqual(sorted(response['Cache-Control'].split(', ')),
                                 sorted(['private', 'max-age=%d' % settings.IMAGE_CACHE_MAX_AGE]), url)

    @override_settings(IMAGE_CACHE_MAX_AGE=0)
    def test_cache_headers_can_be_disabled(self):
        response = self.client.get(self.tile_url(self.image))
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('max-age', response.get('Cache-Control', ''))


class SessionEngineTest(TestCase):

    def settings_with_cache(self, backend):
        base = os.path.join(settings.BASE_DIR, 'exact', 'settings_base.py')
        env = {'CACHE_BACKEND': backend} if backend else {}
        with mock.patch.dict(os.environ, env):
            return runpy.run_path(base)

    def test_sessions_are_only_cached_if_the_cache_is_shared_by_the_processes(self):
        local = self.settings_with_cache(None)
        self.assertNotEqual(local.get('SESSION_ENGINE'), 'django.contrib.sessions.backends.cached_db')
        shared = self.settings_with_cache('django.core.cache.backends.filebased.FileBasedCache')
        self.assertEqual(shared['SESSION_ENGINE'], 'django.contrib.sessions.backends.cached_db')

    def session_queries(self, engine):
        with override_settings(SESSION_ENGINE=engine):
            user = User.objects.create_user('s-' + engine[-12:], 's@example.com', 'pw')
            client = APIClient()
            client.force_login(user, backend=settings.AUTHENTICATION_BACKENDS[-1])
            client.get('/api/v1/images/image_sets/')
            with CaptureQueriesContext(connection) as captured:
                self.assertEqual(client.get('/api/v1/images/image_sets/').status_code, 200)
        return sum('django_session' in q['sql'] for q in captured.captured_queries)

    def test_cached_sessions_save_a_query_per_request(self):
        self.assertEqual(self.session_queries('django.contrib.sessions.backends.db'), 1)
        self.assertEqual(self.session_queries('django.contrib.sessions.backends.cached_db'), 0)
