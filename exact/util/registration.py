"""
Registration of the levels of an image pyramid.

Some scanner formats store pyramid levels that are displaced against each other by a fraction of a pixel (seen: Zeiss
CZI read through slideio, 0.2-0.8 px between neighbouring levels at every position). The viewer blends tiles of two
Deep Zoom levels while it loads or zooms, so such a displacement shows as wobbling.

The displacement is measured once per image: each level is compared with the level below it on up to three textured
spots (integer shift search plus parabolic refinement), the results are chained down to level 0 and a level is only
corrected if two spots agree. The offsets are kept in ``images.PyramidRegistration`` together with the size and
modification time of the file and applied when tiles are generated (``zDeepZoomGenerator.get_tile``). Level 0, the
full resolution, is the reference and is never shifted.

The same table and algorithm are used by the Rust port of the server (exact-rust); keep ``ALGORITHM`` in sync.
"""
import logging
import os

import numpy as np

logger = logging.getLogger(__name__)

# bump when the estimation changes: stored results of other versions are measured again
ALGORITHM = 2

WINDOW = 384      # side of the window under test, in pixels of the level
MARGIN = 8
MAX_SHIFT = 3
MAX_SPREAD = 0.15  # the two closest spots must agree within this (px)
MIN_OFFSET = 0.04  # smaller offsets are measurement noise


def _gray(image):
    rgb = np.asarray(image.convert('RGB'), dtype=np.float32)
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def _reduce(array, factor):
    h, w = array.shape[0] // factor * factor, array.shape[1] // factor * factor
    return array[:h, :w].reshape(h // factor, factor, w // factor, factor).mean(axis=(1, 3))


def _best_shift(level, reference):
    """(dx, dy) with level(x + dx, y + dy) ~ reference(x, y), or None if the minimum is not interior."""
    h, w = reference.shape
    core = reference[MARGIN:h - MARGIN, MARGIN:w - MARGIN]
    n = 2 * MAX_SHIFT + 1
    grid = np.empty((n, n))
    for dy in range(-MAX_SHIFT, MAX_SHIFT + 1):
        for dx in range(-MAX_SHIFT, MAX_SHIFT + 1):
            patch = level[MARGIN + dy:h - MARGIN + dy, MARGIN + dx:w - MARGIN + dx]
            grid[dy + MAX_SHIFT, dx + MAX_SHIFT] = float(((patch - core) ** 2).sum())
    iy, ix = np.unravel_index(np.argmin(grid), grid.shape)
    by, bx = int(iy) - MAX_SHIFT, int(ix) - MAX_SHIFT
    if abs(bx) >= MAX_SHIFT or abs(by) >= MAX_SHIFT:
        return None

    def refine(left, mid, right):
        d = left - 2 * mid + right
        return 0.0 if d <= 0 else 0.5 * (left - right) / d

    return (bx + refine(grid[iy, ix - 1], grid[iy, ix], grid[iy, ix + 1]),
            by + refine(grid[iy - 1, ix], grid[iy, ix], grid[iy + 1, ix]))


def _offsets_at(osr, centre):
    """Chained offsets of every level at one spot; NaN where a level could not be measured."""
    dims, downs = osr.level_dimensions, osr.level_downsamples
    out = [(0.0, 0.0)]
    for k in range(1, len(dims)):
        ratio = downs[k] / downs[k - 1]
        r = round(ratio)
        w, h = int(dims[k][0]), int(dims[k][1])
        side = min(WINDOW, w - 2 * MARGIN, h - 2 * MARGIN)
        if abs(ratio - r) > 0.02 or r < 1 or side < 64:
            out.append((0.0, 0.0))
            continue
        a = int(min(max(centre[0] / downs[k] - side // 2, MARGIN), w - side - MARGIN))
        b = int(min(max(centre[1] / downs[k] - side // 2, MARGIN), h - side - MARGIN))
        location = (int(a * downs[k]), int(b * downs[k]))
        try:
            level = _gray(osr.read_region(location, k, (side, side)))
            below = _gray(osr.read_region(location, k - 1, (side * r, side * r)))
        except Exception:  # noqa: BLE001 - a level that cannot be read is simply not corrected
            out.append((float('nan'), float('nan')))
            continue
        reference = _reduce(below, r)
        measured = None if reference.std() < 6.0 else _best_shift(level, reference)
        if measured is None:
            out.append((float('nan'), float('nan')))
            continue
        # the level below is itself displaced by out[k - 1] of its own pixels, i.e. that / r pixels of this level
        out.append((measured[0] + out[k - 1][0] / r, measured[1] + out[k - 1][1] / r))
    return out


def estimate_level_offsets(osr):
    """
    Offsets per level, in pixels of that level: sampling level k at (x + dx, y + dy) gives the content of level 0 at the
    matching position. Empty if there is a single level or no texture to measure on.
    """
    dims, downs = osr.level_dimensions, osr.level_downsamples
    n = len(dims)
    if n < 2:
        return []
    last = n - 1
    thumb = _gray(osr.read_region((0, 0), last, (int(dims[last][0]), int(dims[last][1]))))
    lh, lw = thumb.shape
    ch, cw = max(lh // 4, 1), max(lw // 4, 1)
    cells = sorted(((thumb[cy * ch:(cy + 1) * ch, cx * cw:(cx + 1) * cw].std(), cx, cy)
                    for cy in range(4) for cx in range(4)), reverse=True)
    spots = [_offsets_at(osr, ((cx + 0.5) * cw * downs[last], (cy + 0.5) * ch * downs[last]))
             for std, cx, cy in cells if std >= 8.0][:3]
    if not spots:
        return []
    offsets = [(0.0, 0.0)]  # level 0 is the reference
    for k in range(1, n):
        values = [s[k] for s in spots if np.isfinite(s[k][0]) and np.isfinite(s[k][1])]
        if not values:
            offsets.append((0.0, 0.0))
        elif len(values) == 1:
            offsets.append(tuple(0.0 if abs(v) < MIN_OFFSET else v for v in values[0]))
        else:
            # the closest pair of spots must agree, otherwise nothing is applied
            best = min(((max(abs(a[0] - b[0]), abs(a[1] - b[1])), a, b)
                        for i, a in enumerate(values) for b in values[i + 1:]), key=lambda t: t[0])
            if best[0] <= MAX_SPREAD:
                mean = ((best[1][0] + best[2][0]) / 2, (best[1][1] + best[2][1]) / 2)
                offsets.append(tuple(0.0 if abs(v) < MIN_OFFSET else v for v in mean))
            else:
                offsets.append((0.0, 0.0))
    return offsets


def level_offsets_for(image, osr, path):
    """
    The registration offsets of an image: from the database if they were measured on this version of the file with this
    version of the algorithm, otherwise measured now and stored. [] for formats whose levels are registered.
    """
    if not getattr(osr, 'needs_registration', False) or image.depth != 1:
        return []
    from exact.images.models import PyramidRegistration

    stat = os.stat(path)
    size, mtime = stat.st_size, int(stat.st_mtime)
    stored = PyramidRegistration.objects.filter(image=image).first()
    if stored and stored.algorithm == ALGORITHM and stored.file_size == size and stored.file_mtime == mtime:
        return [tuple(o) for o in stored.offsets]
    offsets = estimate_level_offsets(osr)
    if offsets:
        offsets[0] = (0.0, 0.0)
    logger.info('pyramid level offsets of image %s: %s', image.pk, ['(%.2f, %.2f)' % o for o in offsets])
    PyramidRegistration.objects.update_or_create(image=image, defaults={
        'offsets': [list(o) for o in offsets], 'algorithm': ALGORITHM, 'file_size': size, 'file_mtime': mtime})
    return offsets


def attach_level_offsets(slide, image, path):
    """Sets ``slide.level_offsets`` (once per cached slide) and returns the slide."""
    if getattr(slide, 'level_offsets', None) is None:
        slide.level_offsets = level_offsets_for(image, slide._osr, path)
    return slide
