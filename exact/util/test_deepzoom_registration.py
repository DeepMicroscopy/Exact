"""Neighbouring Deep Zoom levels must stay registered (no sub-pixel shift between levels).

The viewer blends tiles of two levels while it loads or zooms; if a level is displaced by a fraction of a pixel
against its neighbours the image appears to wobble. Tiles used to be an integer-cropped region of the slide that
was shrunk with ``Image.thumbnail`` (aspect ratio kept), which made the scale of the last tile row/column of a
level differ from the others and shifted content by up to ~0.9 px.
"""
import math
import unittest

import numpy as np
import openslide
from PIL import Image

from util.slide_server import zDeepZoomGenerator


class _Slide(openslide.ImageSlide):
    """ImageSlide with the ``frame`` argument that the handlers in slide_server accept."""

    def read_region(self, location, level, size, frame=0):
        return super().read_region(location, level, size)


def _texture(width, height):
    """Smooth, aperiodic grey image with structure at every scale (so shifts are measurable)."""
    rng = np.random.RandomState(7)
    y, x = np.mgrid[0:height, 0:width].astype(np.float64)
    img = np.zeros((height, width))
    for _ in range(60):
        cx, cy = rng.uniform(0, width), rng.uniform(0, height)
        s = rng.uniform(4, max(width, height) / 6)
        img += rng.uniform(-1, 1) * np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s)))
    img = (img - img.min()) / (img.max() - img.min())
    return Image.fromarray((img * 255).astype(np.uint8)).convert('RGB')


def _shift(a, b):
    """Sub-pixel (dy, dx) such that b is a displaced by it, from the peak of the cross-correlation."""
    a = a - a.mean()
    b = b - b.mean()
    f = np.fft.ifft2(np.fft.fft2(b) * np.conj(np.fft.fft2(a))).real
    iy, ix = np.unravel_index(np.argmax(f), f.shape)

    def refine(index, size, get):
        left, mid, right = get(index - 1), get(index), get(index + 1)
        denom = left - 2 * mid + right
        delta = 0.0 if denom == 0 else 0.5 * (left - right) / denom
        pos = index + delta
        return pos - size if pos > size / 2 else pos

    dy = refine(iy, f.shape[0], lambda i: f[i % f.shape[0], ix])
    dx = refine(ix, f.shape[1], lambda i: f[iy, i % f.shape[1]])
    return dy, dx


class DeepZoomRegistrationTest(unittest.TestCase):
    # sizes whose pyramid levels are not multiples of the downsample (the case that used to shift)
    SIZES = [(1920, 1371), (1969, 1301)]

    def _mosaic(self, dz, level):
        z_w, z_h = dz.level_dimensions[level]
        cols, rows = dz.level_tiles[level]
        mosaic = Image.new('L', (z_w, z_h))
        for row in range(rows):
            for col in range(cols):
                tile = dz.get_tile(level, (col, row))
                mosaic.paste(tile.convert('L'), (col * 254 - (1 if col else 0), row * 254 - (1 if row else 0)))
        return mosaic

    def test_levels_are_registered_and_tiles_have_exact_size(self):
        for width, height in self.SIZES:
            image = _texture(width, height)
            dz = zDeepZoomGenerator(_Slide(image))
            top = dz.level_count - 1
            for level in range(top, top - 5, -1):
                with self.subTest(size=(width, height), level=level):
                    z_w, z_h = dz.level_dimensions[level]
                    cols, rows = dz.level_tiles[level]
                    for row in range(rows):
                        for col in range(cols):
                            expected = (
                                min(254, z_w - 254 * col) + (1 if col else 0) + (1 if col < cols - 1 else 0),
                                min(254, z_h - 254 * row) + (1 if row else 0) + (1 if row < rows - 1 else 0),
                            )
                            self.assertEqual(dz.get_tile(level, (col, row)).size, expected)
                    reference = image.convert('L').resize((z_w, z_h), Image.BOX)
                    dy, dx = _shift(np.asarray(reference, dtype=float), np.asarray(self._mosaic(dz, level), dtype=float))
                    self.assertLess(abs(dy), 0.15, 'level %d displaced vertically by %.2f px' % (level, dy))
                    self.assertLess(abs(dx), 0.15, 'level %d displaced horizontally by %.2f px' % (level, dx))


if __name__ == '__main__':
    unittest.main()
