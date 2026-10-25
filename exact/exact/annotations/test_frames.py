import re
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from exact.administration.models import Product
from exact.annotations.models import Annotation, AnnotationType
from exact.images.models import Image, ImageSet
from exact.users.models import Team, User

VIEWER_JS = Path(__file__).parent / 'static' / 'annotations' / 'js' / 'exact-image-viewer.js'


class ViewerFrameGuardTest(TestCase):
    def test_viewer_never_reads_vectors_directly_from_the_tool(self):
        """
        The tool does not know the frame. Vectors that are saved have to come from the viewer's
        getAnnotationVector(), which adds the frame for z-stacks/frames. Reading the vector straight from the
        tool lost the frame of annotations that were moved or resized (and of those created by polygon operations).
        """
        source = VIEWER_JS.read_text()
        direct = [source.count('\n', 0, m.start()) + 1
                  for m in re.finditer(r'(?<!this\.)(?<![\w.])tool\.getAnnotationVector\(', source)]
        self.assertEqual(direct, [], 'exact-image-viewer.js reads vectors directly from the tool in lines %s; '
                                     'use (event.userData|this).getAnnotationVector instead' % direct)


class ReportMissingFramesTest(TestCase):
    def setUp(self):
        user = User.objects.create_user('u', 'u@example.com', 'pw')
        team = Team.objects.create(name='t')
        image_set = ImageSet.objects.create(name='stacks', team=team, creator=user)
        product = Product.objects.create(name='p', team=team)
        self.box = AnnotationType.objects.create(name='box', product=product,
                                                 vector_type=AnnotationType.VECTOR_TYPE.BOUNDING_BOX)
        self.multi = AnnotationType.objects.create(name='multi', product=product, multi_frame=True,
                                                   vector_type=AnnotationType.VECTOR_TYPE.BOUNDING_BOX)
        self.global_type = AnnotationType.objects.create(name='global', product=product,
                                                         vector_type=AnnotationType.VECTOR_TYPE.GLOBAL)
        self.stack = Image.objects.create(name='stack.tiff', filename='stack.tiff', image_set=image_set, frames=5)
        self.flat = Image.objects.create(name='flat.png', filename='flat.png', image_set=image_set)
        self.user = user

    def annotation(self, image, annotation_type, vector, deleted=False):
        return Annotation.objects.create(image=image, annotation_type=annotation_type, user=self.user,
                                         vector=vector, deleted=deleted)

    def report(self, *args):
        out = StringIO()
        call_command('report_missing_frames', *args, stdout=out)
        return out.getvalue()

    def test_reports_only_annotations_that_are_hidden_by_the_missing_frame(self):
        box = {'x1': 1, 'y1': 1, 'x2': 5, 'y2': 5}
        self.annotation(self.stack, self.box, dict(box, frame=2))                 # fine
        missing = self.annotation(self.stack, self.box, box)                      # affected
        self.annotation(self.stack, self.box, box, deleted=True)                  # deleted
        self.annotation(self.stack, self.multi, box)                              # shown on every frame
        self.annotation(self.stack, self.global_type, {'x1': 0, 'y1': 0, 'x2': 5, 'y2': 5})  # no frame by design
        self.annotation(self.flat, self.box, box)                                 # not a multi frame image

        output = self.report('--ids')
        self.assertIn('1 annotations without frame', output)
        self.assertIn('stack.tiff', output)
        self.assertNotIn('flat.png', output)
        self.assertIn('ids: %d' % missing.id, output)

        self.assertIn('2 annotations without frame', self.report('--include-multi-frame-types'))

    def test_nothing_to_report(self):
        self.annotation(self.stack, self.box, {'x1': 1, 'y1': 1, 'x2': 5, 'y2': 5, 'frame': 0})
        self.assertIn('No annotations without frame found', self.report())
