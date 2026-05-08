# Architecture

## Overview

EXACT is a Django application with a PostgreSQL database, Redis cache, and a tile server that streams image regions to an OpenSeaDragon viewer in the browser.

```
Browser (OSD viewer + JS)
        │  HTTP tile requests
        ▼
    Nginx / Gunicorn
        │
    Django (exact/)
    ├── images/          ← ImageSet, Image models; tile serving
    ├── annotations/     ← Annotation, AnnotationType, Verification
    ├── administration/  ← Product, Plugin management
    ├── users/           ← Team, membership
    ├── processing/      ← Plugin jobs and results
    └── datasets/        ← Dataset versioning
        │
    PostgreSQL ─── Redis (tile + slide cache)
        │
    Filesystem (IMAGE_PATH)
```

## Django Apps

| App | Responsibility |
|---|---|
| `images` | Image upload, tile serving, imageset management |
| `annotations` | Annotation CRUD, verification, export |
| `administration` | Products, annotation types, plugins, export formats |
| `users` | Teams, membership, passkeys |
| `processing` | Plugin job queue and results |
| `datasets` | Dataset versioning and snapshots |
| `base` | Base templates and shared views |
| `tagger_messages` | In-app notification system |
| `tools` | Utility views (registration, snapshots) |

## Tile Serving Pipeline

The tile serving pipeline converts image files into 254×254 px tiles on demand:

```
Request: /images/image/<id>/<z>/<frame>/tile_files/<level>/<col>_<row>.png
         │
         ▼
    view_image_tile()  (images/views.py)
         │
         ├── SlideCache.get(file_path, plane=plane)
         │       ├── _osr_cache  → raw handler (OpenSlide / NIfTI / …)
         │       └── _cache      → DeepZoomGenerator keyed by (path, plane)
         │
         └── zDeepZoomGenerator.get_tile(level, (col, row), frame, plane)
                 └── handler.read_region(location, level, size, frame, plane)
                         └── PIL Image → PNG bytes → HTTP response
```

### SlideCache

`SlideCache` (in `util/slide_server.py`) is a two-level LRU cache:

- **`_osr_cache`** — raw image handler objects (OpenSlide, NIfTISlide, …), keyed by file path. These are expensive to open (file parsing, nibabel reorientation).
- **`_cache`** — `zDeepZoomGenerator` instances keyed by `(file_path, plane)`. Plane variants of the same file each get their own generator.

Both levels are bounded by `SLIDE_CACHE_SIZE` from settings, with LRU eviction.

### zDeepZoomGenerator

`zDeepZoomGenerator` wraps a raw handler and exposes a DeepZoom tile interface. For multi-plane handlers it delegates dimension and frame queries to the handler:

- `dimensions_for_plane(plane)` → `(width, height)` or `None` if not MPR-capable
- `nframes_for_plane(plane)` → number of slices in that plane
- `get_tile(level, address, frame, plane)` → PIL Image

Non-MPR handlers always use `plane=0` and the wrapper is transparent.

## Image Format Abstraction

New image formats are supported by implementing the OpenSlide-compatible interface:

```python
class MyHandler:
    @property
    def dimensions(self) -> tuple[int, int]: ...
    @property
    def level_count(self) -> int: ...
    @property
    def level_dimensions(self) -> list[tuple[int, int]]: ...
    @property
    def level_downsamples(self) -> list[float]: ...
    @property
    def properties(self) -> dict[str, str]: ...
    @property
    def nFrames(self) -> int: ...

    def read_region(self, location, level, size, frame=0, plane=0) -> Image: ...
    def get_thumbnail(self, size) -> Image: ...
    def get_best_level_for_downsample(self, downsample) -> int: ...
```

Handlers that support MPR also implement:
```python
    def dimensions_for_plane(self, plane: int) -> tuple[int, int]: ...
    def nframes_for_plane(self, plane: int) -> int: ...
```

See [Adding Image Formats](adding-image-formats.md) for a step-by-step guide.

## Frontend Architecture

The annotator UI is built on [OpenSeaDragon](https://openseadragon.github.io/) (OSD). Key JavaScript components:

| File | Role |
|---|---|
| `exact-image-viewer.js` | Main viewer class — OSD lifecycle, frame slider, MPR mode |
| `exact-annotation-card.js` | Per-annotation UI card |
| `exact-annotation-types.js` | Annotation type palette |
| `show-image-properties.js` | Fetches and displays image metadata; dispatches `exactMPRPlanesAvailable` |
| `exact-tag-manager.js` | Imageset tag UI |

The viewer communicates with the server exclusively via:

- **DeepZoom tile URLs** — OSD fetches tiles directly
- **REST API** (`/api/v1/`) — annotation CRUD, metadata
- **Custom endpoints** — `image_metadata`, `view_image` (DZI descriptor)

Inter-component communication uses browser custom events (e.g., `exactMPRPlanesAvailable`) rather than direct references, allowing components to be loaded independently.

## REST API

The REST API is built with Django REST Framework. All endpoints are registered in `exact/api.py` via DRF routers and mounted at `/api/v1/`.

Authentication: token-based (`/api/auth/token/login/`). JWT is also available via `djangorestframework-simplejwt`.

Field filtering uses `drf-flex-fields` (`expand=`, `fields=`, `omit=`) and `django-filter` (`field__contains=`, etc.).
