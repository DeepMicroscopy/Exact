import importlib

from django.test import TestCase

from exact.images.models import Image, ImageSet
from exact.users.models import Team, User

migration = importlib.import_module('exact.images.migrations.0040_backfill_crop_source')


class BackfillCropSourceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('u', 'u@example.com', 'pw')
        self.team = Team.objects.create(name='t')
        self.sources = ImageSet.objects.create(name='sources', team=self.team, creator=self.user)
        self.crops = ImageSet.objects.create(name='crops', team=self.team, creator=self.user)
        self.source = self.image(self.sources, 'slide 1.ndpi', width=10000, height=8000)

    def image(self, image_set, name, filename=None, width=100, height=100, **kwargs):
        return Image.objects.create(name=name, filename=filename or name, image_set=image_set,
                                    width=width, height=height, **kwargs)

    def crop(self, name='slide 1x1000_y2000_z0_w300_h200.tiff', image_set=None, width=300, height=200, **kwargs):
        return self.image(image_set or self.crops, name, width=width, height=height, **kwargs)

    def run_backfill(self):
        return migration.backfill_crop_sources(Image)

    def test_crop_is_linked_to_its_source(self):
        crop = self.crop('slide 1x1000_y2000_z3_w300_h200.tiff')
        self.source.frames = 5
        self.source.save()
        self.assertEqual(self.run_backfill(), 1)
        crop.refresh_from_db()
        self.assertEqual(crop.crop_source_id, self.source.id)
        self.assertEqual((crop.crop_x, crop.crop_y, crop.crop_frame), (1000, 2000, 3))
        self.assertEqual(crop.crop_region, (1000, 2000, 1300, 2200))

    def test_is_idempotent_and_keeps_existing_links(self):
        other = self.image(self.sources, 'other.ndpi', width=10000, height=8000)
        linked = self.crop('slide 1x1_y1_z0_w300_h200.tiff', crop_source=other, crop_x=5, crop_y=6, crop_frame=0)
        fresh = self.crop()
        self.assertEqual(self.run_backfill(), 1)
        self.assertEqual(self.run_backfill(), 0)
        linked.refresh_from_db()
        self.assertEqual((linked.crop_source_id, linked.crop_x, linked.crop_y), (other.id, 5, 6))
        fresh.refresh_from_db()
        self.assertEqual(fresh.crop_source_id, self.source.id)

    def test_names_that_only_look_similar_are_ignored(self):
        self.crop('photo.tiff')
        self.crop('slide 1x1000_y2000_z0_w300_h200.png')                       # not a tiff
        self.crop('slide 1x1000_y2000_z0_w999_h200.tiff', width=300)            # size does not match the image
        self.crop('unknown slidex1000_y2000_z0_w300_h200.tiff')                 # no such source
        self.assertEqual(self.run_backfill(), 0)

    def test_region_has_to_fit_into_the_source(self):
        self.crop('slide 1x9900_y2000_z0_w300_h200.tiff')                       # 9900 + 300 > 10000
        self.crop('slide 1x100_y7900_z0_w300_h200.tiff')                        # 7900 + 200 > 8000
        self.crop('slide 1x100_y100_z4_w300_h200.tiff')                         # the source has one frame only
        self.assertEqual(self.run_backfill(), 0)

    def test_only_sources_of_the_same_team_are_used(self):
        foreign_set = ImageSet.objects.create(name='foreign', team=Team.objects.create(name='x'), creator=self.user)
        self.source.delete()
        self.image(foreign_set, 'slide 1.ndpi', width=10000, height=8000)
        self.crop()
        self.assertEqual(self.run_backfill(), 0)

    def test_copies_of_the_source_prefer_the_image_set_of_the_crop_then_the_original(self):
        copy_set = ImageSet.objects.create(name='copies', team=self.team, creator=self.user)
        copy = self.image(copy_set, 'slide 1.ndpi', width=10000, height=8000)     # newer copy in another set
        crop = self.crop()
        self.run_backfill()
        crop.refresh_from_db()
        self.assertEqual(crop.crop_source_id, self.source.id)                     # the oldest one: the original

        local_copy = self.image(self.crops, 'slide 1.ndpi', width=10000, height=8000)
        crop2 = self.crop('slide 1x10_y10_z0_w300_h200.tiff')
        self.run_backfill()
        crop2.refresh_from_db()
        self.assertEqual(crop2.crop_source_id, local_copy.id)                     # same image set as the crop

    def test_file_name_decides_not_the_display_name(self):
        self.source.delete()
        source = self.image(self.sources, 'Display name.svs', filename='stored.svs', width=10000, height=8000)
        self.crop('storedx1000_y2000_z0_w300_h200.tiff')
        self.assertEqual(self.run_backfill(), 1)
        self.assertEqual(Image.objects.get(name__startswith='storedx').crop_source_id, source.id)

    def test_crops_of_z_stacks(self):
        stack = self.image(self.sources, 'stack.ome.tiff', width=5000, height=4000, depth=5)
        crop = self.crop('1_1_stack.omex10_y20_z2_w300_h200.tiff')
        self.run_backfill()
        crop.refresh_from_db()
        self.assertEqual(crop.crop_source_id, stack.id)
        self.assertEqual(crop.crop_frame, 2)
