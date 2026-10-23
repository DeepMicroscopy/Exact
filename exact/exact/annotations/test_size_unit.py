from django.test import TestCase
from rest_framework.test import APIClient

from exact.administration.models import Product
from exact.annotations.models import Annotation, AnnotationType
from exact.images.models import Image, ImageSet
from exact.users.models import Team, User

VT = AnnotationType.VECTOR_TYPE


class SizeUnitTest(TestCase):
    def test_pixel_size_conversion(self):
        at = AnnotationType(vector_type=VT.FIXED_SIZE_BOUNDING_BOX, default_width=50, default_height=25)
        self.assertEqual(at.size_in_pixels(0.25), (50, 25))  # px: mpp irrelevant

        at.size_unit = AnnotationType.SIZE_UNIT.MICRONS
        self.assertEqual(at.size_in_pixels(0.5), (100, 50))

        at.size_unit = AnnotationType.SIZE_UNIT.MILLIMETERS
        at.default_width, at.default_height = 0.05, 0.1
        w, h = at.size_in_pixels(0.5)  # 50 um / 0.5 um/px
        self.assertAlmostEqual(w, 100)
        self.assertAlmostEqual(h, 200)

    def test_unknown_mpp_falls_back_to_pixels(self):
        at = AnnotationType(size_unit=AnnotationType.SIZE_UNIT.MILLIMETERS, default_width=3, default_height=4)
        self.assertIsNone(at.unit_to_pixel_factor(0))
        self.assertEqual(at.size_in_pixels(0), (3, 4))

    def test_can_convert(self):
        self.assertTrue(AnnotationType.can_convert(VT.BOUNDING_BOX, VT.FIXED_SIZE_BOUNDING_BOX))
        self.assertTrue(AnnotationType.can_convert(VT.FIXED_SIZE_BOUNDING_BOX, VT.BOUNDING_BOX))
        self.assertTrue(AnnotationType.can_convert(VT.POLYGON, VT.POLYGON))
        self.assertFalse(AnnotationType.can_convert(VT.BOUNDING_BOX, VT.POLYGON))
        self.assertFalse(AnnotationType.can_convert(VT.POINT, VT.BOUNDING_BOX))
        self.assertFalse(AnnotationType.can_convert(VT.POLYGON, VT.FIXED_SIZE_BOUNDING_BOX))


class AnnotationTypeChangeApiTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser("u", "u@example.com", "pw")
        team = Team.objects.create(name="t")
        team.members.add(self.user)
        product = Product.objects.create(name="p", team=team)
        image_set = ImageSet.objects.create(name="s", team=team, creator=self.user)
        image = Image.objects.create(name="i", image_set=image_set, width=100, height=100, filename="i.png")
        self.bbox = AnnotationType.objects.create(name="bb", vector_type=VT.BOUNDING_BOX, product=product)
        self.fixed = AnnotationType.objects.create(name="fx", vector_type=VT.FIXED_SIZE_BOUNDING_BOX, product=product)
        self.poly = AnnotationType.objects.create(name="po", vector_type=VT.POLYGON, product=product)
        self.anno = Annotation.objects.create(image=image, annotation_type=self.bbox, user=self.user,
                                              vector={"x1": 10, "y1": 10, "x2": 30, "y2": 30})
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def patch(self, annotation_type):
        return self.client.patch(f"/api/v1/annotations/annotations/{self.anno.id}/",
                                 {"annotation_type": annotation_type.id}, format="json")

    def test_box_to_fixed_box_allowed(self):
        r = self.patch(self.fixed)
        self.assertEqual(r.status_code, 200, r.content)
        self.anno.refresh_from_db()
        self.assertEqual(self.anno.annotation_type_id, self.fixed.id)

    def test_box_to_polygon_rejected(self):
        r = self.patch(self.poly)
        self.assertEqual(r.status_code, 400, r.content)
        self.anno.refresh_from_db()
        self.assertEqual(self.anno.annotation_type_id, self.bbox.id)

    def test_serializer_exposes_unit(self):
        r = self.client.get(f"/api/v1/annotations/annotation_types/{self.bbox.id}/")
        self.assertEqual(r.data["size_unit"], "px")
