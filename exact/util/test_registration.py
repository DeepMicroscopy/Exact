"""Estimation of the displacement between pyramid levels (util.registration) and its use by the tile generator."""
import unittest

import numpy as np
import openslide
from PIL import Image

from util import registration
from util.slide_server import zDeepZoomGenerator


def _texture(width, height, seed=3):
    rng = np.random.RandomState(seed)
    y, x = np.mgrid[0:height, 0:width].astype(np.float64)
    img = np.full((height, width), 128.0)
    for _ in range(90):
        cx, cy, s, a = rng.uniform(0, width), rng.uniform(0, height), rng.uniform(3, 35), rng.uniform(-110, 110)
        img += a * np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s)))
    return np.clip(img, 0, 255)


def _shifted_half(big, sx, sy, size):
    """The ``size`` x ``size`` window of ``big`` at (sx, sy) (fractional), halved: exactly 2:1, only displaced."""
    image = Image.fromarray(big.astype(np.float32), mode='F')
    return np.asarray(image.resize((size // 2, size // 2), Image.BOX, box=(sx, sy, sx + size, sy + size)))


class _Pyramid:
    """Minimal slide object with levels of exactly 2^k, as the handlers in slide_server provide."""

    def __init__(self, levels):
        self._levels = [Image.fromarray(np.clip(l, 0, 255).astype(np.uint8)).convert('RGBA') for l in levels]
        self.level_count = len(levels)
        self.level_dimensions = [im.size for im in self._levels]
        self.level_downsamples = [2.0 ** k for k in range(len(levels))]
        self.dimensions = self.level_dimensions[0]
        self.properties = {}
        self.needs_registration = True

    def get_best_level_for_downsample(self, downsample):
        return max(k for k, d in enumerate(self.level_downsamples) if d <= downsample + 1e-9)

    def read_region(self, location, level, size, frame=0):
        ds = int(self.level_downsamples[level])
        x, y = location[0] // ds, location[1] // ds
        tile = Image.new('RGBA', size, (0, 0, 0, 0))
        tile.paste(self._levels[level], (-x, -y))
        return tile


N = 1024


class RegistrationEstimateTest(unittest.TestCase):

    def test_finds_a_displaced_level(self):
        big = _texture(N + 16, N + 16)
        level0 = big[8:8 + N, 8:8 + N]
        # level 1 shows the content displaced by (+1.2, -0.8) source px = (+0.6, -0.4) of its own pixels
        level1 = _shifted_half(big, 8 + 1.2, 8 - 0.8, N)
        offsets = registration.estimate_level_offsets(_Pyramid([level0, level1]))
        self.assertEqual(offsets[0], (0.0, 0.0), 'level 0 is the reference and never shifted')
        # sampling level 1 at (x + dx) must give the reference: dx = -0.6, dy = +0.4
        self.assertAlmostEqual(offsets[1][0], -0.6, delta=0.15)
        self.assertAlmostEqual(offsets[1][1], 0.4, delta=0.15)

    def test_a_registered_pyramid_gets_no_offsets(self):
        big = _texture(N + 16, N + 16)
        offsets = registration.estimate_level_offsets(_Pyramid([big[8:8 + N, 8:8 + N], _shifted_half(big, 8, 8, N)]))
        self.assertEqual(offsets, [(0.0, 0.0), (0.0, 0.0)], 'noise below the threshold is not applied')

    def test_a_single_level_has_nothing_to_register(self):
        self.assertEqual(registration.estimate_level_offsets(_Pyramid([_texture(512, 512)])), [])


class GeneratorUsesOffsetsTest(unittest.TestCase):

    def _tiles(self, offsets):
        big = _texture(N + 16, N + 16)
        slide = _Pyramid([big[8:8 + N, 8:8 + N], _shifted_half(big, 8, 8, N)])
        generator = zDeepZoomGenerator(slide)
        generator.level_offsets = offsets
        top = generator.level_count - 1
        return generator.get_tile(top, (1, 1)), generator.get_tile(top - 1, (1, 1))

    def test_level_zero_is_not_shifted_and_other_levels_are(self):
        plain0, plain1 = self._tiles(None)
        shifted0, shifted1 = self._tiles([(7.0, -5.0), (0.6, 0.3)])  # an absurd offset for level 0 must be ignored
        self.assertEqual(plain0.tobytes(), shifted0.tobytes())
        self.assertNotEqual(plain1.tobytes(), shifted1.tobytes())


if __name__ == '__main__':
    unittest.main()
