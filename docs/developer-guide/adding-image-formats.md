# Adding Image Formats

EXACT uses an OpenSlide-compatible handler interface. Any class that implements the interface below can be registered as a format handler without touching the tile server or the viewer.

## 1. Implement the handler

Create a file in `exact/util/` (e.g., `myformat.py`):

```python
from PIL import Image
from typing import Dict, List, Tuple

class MyFormatSlide:
    def __init__(self, filename: str):
        # Open the file and read metadata here
        self.filename = filename
        self._width = ...
        self._height = ...

    # ── Required: OpenSlide-compatible properties ─────────────────────────

    @property
    def dimensions(self) -> Tuple[int, int]:
        """(width, height) at full resolution."""
        return (self._width, self._height)

    @property
    def level_count(self) -> int:
        return 1  # return >1 if you have a native image pyramid

    @property
    def level_dimensions(self) -> List[Tuple[int, int]]:
        return [(self._width, self._height)]

    @property
    def level_downsamples(self) -> List[float]:
        return [1.0]

    def get_best_level_for_downsample(self, downsample: float) -> int:
        return 0

    @property
    def properties(self) -> Dict[str, str]:
        return {
            'openslide.mpp-x': '0.5',   # microns per pixel, x
            'openslide.mpp-y': '0.5',   # microns per pixel, y
            'openslide.objective-power': '20',
            'openslide.vendor': 'MyFormat',
        }

    # ── Required: tile reading ────────────────────────────────────────────

    def read_region(
        self,
        location: Tuple[int, int],
        level: int,
        size: Tuple[int, int],
        frame: int = 0,
        plane: int = 0,
    ) -> Image.Image:
        """Return an RGBA PIL Image for the requested region."""
        x, y = location
        w, h = size
        # ... read the pixel data and return as RGBA ...
        return Image.fromarray(rgba_array, 'RGBA')

    def get_thumbnail(self, size: Tuple[int, int]) -> Image.Image:
        return self.read_region((0, 0), 0, size)

    # ── Required: frame / z-stack support ────────────────────────────────

    @property
    def nFrames(self) -> int:
        return 1  # number of z/t frames

    @property
    def frame_type(self):
        from util.enums import FrameType
        return FrameType.ZSTACK  # or FrameType.NONE

    @property
    def frame_descriptors(self) -> List[str]:
        return ['frame 0']

    @property
    def default_frame(self) -> int:
        return 0
```

### Optional: Multi-Planar Reformat (MPR)

If your format is a 3D volume and you want axial/coronal/sagittal views, add these methods:

```python
    def dimensions_for_plane(self, plane: int) -> Tuple[int, int]:
        """Return (width, height) for the given plane index (0=axial, 1=coronal, 2=sagittal).
        Return None if this format does not support MPR."""
        from util.enums import PlaneType
        if plane == PlaneType.AXIAL:
            return self._ax_dims
        if plane == PlaneType.CORONAL:
            return self._cor_dims
        if plane == PlaneType.SAGITTAL:
            return self._sag_dims

    def nframes_for_plane(self, plane: int) -> int:
        """Return the number of slices along the normal axis of the given plane."""
        ...
```

## 2. Register the handler

Open `util/slide_server.py` and find the `_open_slide` function (or the handler-selection logic). Add a detection branch before the OpenSlide fallback:

```python
from util.myformat import MyFormatSlide

def _open_slide(path: str):
    if path.endswith('.myext'):
        return MyFormatSlide(path)
    # ... existing handlers ...
    return openslide.OpenSlide(path)
```

## 3. Make it picklable (for caching)

The slide cache serialises handlers via `pickle`. Implement `__reduce__` so the handler can be reconstructed from just the filename:

```python
def __reduce__(self):
    return (self.__class__, (self.filename,))
```

## 4. Test the tile pipeline

Upload a sample file and check:

1. The imageset view shows a thumbnail.
2. The annotator opens and tiles load at multiple zoom levels.
3. If multi-frame: the frame slider appears and stepping through frames works.
4. If MPR: the plane selector appears and all three reformats render correctly.

## Reference: NIfTI implementation

`util/nifti.py` is a complete reference implementation for a volumetric format with MPR. It covers:

- RAS+ reorientation via nibabel
- Per-plane pixel dimension calculation with aspect-ratio correction
- Radiological display convention (Anterior/Superior at top, patient Right on left)
- Windowing from a sparse intensity sample
- `__reduce__` for cache serialisation
