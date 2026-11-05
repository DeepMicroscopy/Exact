"""The data folder of an Olympus VSI file: the scanner replaces everything but letters and digits in its name by underscores."""
import os
import tempfile
import unittest

from util.slideio import vsi_data_folder, vsi_path


class VsiFolderTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = self._tmp.name
        self.addCleanup(self._tmp.cleanup)

    def _vsi(self, name, folder):
        os.mkdir(os.path.join(self.dir, folder))
        path = os.path.join(self.dir, name)
        open(path, 'wb').write(b'index')
        return path

    def test_scanner_spelling_is_found(self):
        path = self._vsi('slide-1.vsi', '_slide_1_')
        self.assertEqual(vsi_data_folder(path), os.path.join(self.dir, '_slide_1_'))
        linked = vsi_path(path)
        self.assertEqual(os.path.basename(linked), 'slide_1.vsi')
        self.assertTrue(os.path.isdir(os.path.join(os.path.dirname(linked), '_slide_1_')))

    def test_exact_spelling_is_left_alone(self):
        path = self._vsi('a-b.vsi', '_a-b_')
        self.assertEqual(vsi_data_folder(path), os.path.join(self.dir, '_a-b_'))
        self.assertEqual(vsi_path(path), path)

    def test_other_files_and_missing_folders(self):
        self.assertIsNone(vsi_data_folder(os.path.join(self.dir, 'none.vsi')))
        self.assertEqual(vsi_path(os.path.join(self.dir, 'none.vsi')), os.path.join(self.dir, 'none.vsi'))
        self.assertEqual(vsi_path(os.path.join(self.dir, 'x.czi')), os.path.join(self.dir, 'x.czi'))


if __name__ == '__main__':
    unittest.main()
