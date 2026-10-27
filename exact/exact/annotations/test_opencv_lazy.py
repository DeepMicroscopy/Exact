import re
from pathlib import Path

from django.test import SimpleTestCase

TEMPLATES = Path(__file__).parent / 'templates' / 'annotations'
JS = Path(__file__).parent / 'static' / 'annotations' / 'js'


class OpenCvIsLoadedOnDemandTest(SimpleTestCase):
    """opencv.js has 7.7 MB: the annotation pages must not load it directly, features that need it ask for it."""

    def test_annotation_pages_do_not_load_opencv_js_directly(self):
        for name in ('annotate.html', 'annotate_v2.html', 'annotate_v3.html'):
            source = (TEMPLATES / name).read_text()
            self.assertIsNone(re.search(r'<script[^>]+src="[^"]*annotations/js/opencv\.js', source),
                              '%s loads opencv.js with the page' % name)
            self.assertIn('exact-opencv.js', source, '%s does not include the loader' % name)
            self.assertIn('EXACT_OPENCV_URL', source)

    def test_features_that_need_opencv_load_it_first(self):
        for name, needs in (('exact-quad-tree.js', 'EXACTOpenCV.load()'),
                            ('screeningTool.js', 'EXACTOpenCV.load()'),
                            ('openseadragon_filtering_viewer.js', 'EXACTOpenCV.load()')):
            self.assertIn(needs, (JS / name).read_text(), name)
