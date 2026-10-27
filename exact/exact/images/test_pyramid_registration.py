from django.test import TestCase

from exact.administration.models import Product
from exact.images.models import Image, ImageSet, PyramidRegistration
from exact.users.models import Team, User
from util import registration


class _FakeSlide:
    """A slide that needs registration; counts how often it was measured."""
    needs_registration = True

    def __init__(self):
        self.reads = 0
        self.level_dimensions = [(2000, 2000), (1000, 1000)]
        self.level_downsamples = [1.0, 2.0]


class PyramidRegistrationStorageTest(TestCase):

    def setUp(self):
        user = User.objects.create_user('registration-test', password='x')
        team = Team.objects.create(name='registration-test')
        image_set = ImageSet.objects.create(name='set', team=team, creator=user, path='registration-test')
        self.image = Image.objects.create(name='a.czi', filename='a.czi', image_set=image_set, checksum=b'x')
        self.path = __file__  # any existing file: its size and mtime identify the "file version"
        self.calls = []
        self._estimate = registration.estimate_level_offsets
        registration.estimate_level_offsets = lambda osr: self.calls.append(1) or [(0.0, 0.0), (0.4, -0.2)]

    def tearDown(self):
        registration.estimate_level_offsets = self._estimate

    def test_measured_once_then_read_from_the_database(self):
        slide = _FakeSlide()
        self.assertEqual(registration.level_offsets_for(self.image, slide, self.path), [(0.0, 0.0), (0.4, -0.2)])
        self.assertEqual(registration.level_offsets_for(self.image, slide, self.path), [(0.0, 0.0), (0.4, -0.2)])
        self.assertEqual(len(self.calls), 1)
        row = PyramidRegistration.objects.get(image=self.image)
        self.assertEqual(row.offsets, [[0.0, 0.0], [0.4, -0.2]])
        self.assertEqual(row.algorithm, registration.ALGORITHM)

    def test_measured_again_when_the_file_or_the_algorithm_changed(self):
        slide = _FakeSlide()
        registration.level_offsets_for(self.image, slide, self.path)
        PyramidRegistration.objects.filter(image=self.image).update(file_mtime=1)  # file replaced
        registration.level_offsets_for(self.image, slide, self.path)
        PyramidRegistration.objects.filter(image=self.image).update(algorithm=registration.ALGORITHM - 1)
        registration.level_offsets_for(self.image, slide, self.path)
        self.assertEqual(len(self.calls), 3)

    def test_formats_with_registered_levels_are_not_measured_or_stored(self):
        slide = _FakeSlide()
        slide.needs_registration = False
        self.assertEqual(registration.level_offsets_for(self.image, slide, self.path), [])
        self.assertEqual(self.calls, [])
        self.assertFalse(PyramidRegistration.objects.exists())
