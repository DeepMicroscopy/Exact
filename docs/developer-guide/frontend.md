# Frontend Architecture

## Stack

- **[OpenSeaDragon](https://openseadragon.github.io/)** (OSD) — tile viewer, handles pan/zoom and DeepZoom tile fetching
- **Bootstrap 4** — layout and UI components
- **jQuery 3** — DOM manipulation and AJAX
- **Bootstrap-slider** — frame slider widget

## Key JS Files

All annotation-related JS lives in `exact/annotations/static/annotations/js/`.

| File | Role |
|---|---|
| `exact-image-viewer.js` | Main viewer class. Owns the OSD instance, frame slider, MPR mode, and inter-component wiring. |
| `exact-annotation-card.js` | Renders one annotation as an interactive card in the sidebar. |
| `exact-annotation-types.js` | Renders the annotation type palette and handles selection. |
| `show-image-properties.js` | Fetches `/images/api/image/metadata/<id>/`, populates the info table, and dispatches `exactMPRPlanesAvailable`. |
| `exact-tag-manager.js` | Imageset tag autocomplete and management. |
| `openseadragon.min.js` | OSD library. |

## ExactImageViewer

`ExactImageViewer` is instantiated once per annotator page. Key responsibilities:

**Viewer lifecycle**
```javascript
const viewer = new ExactImageViewer(imageId, options);
// ...
viewer.destroy(); // cleanup before navigating away
```

**Frame navigation** — uses OSD's built-in sequence mode. The frame slider widget (Bootstrap-slider) calls `viewer.goToPage(frame)` on change. To programmatically rebuild the slider (e.g., after a plane switch), destroy and recreate it with the new `max`.

**MPR mode** — activated when the server reports `planes` in the image metadata:

1. `show-image-properties.js` fires `exactMPRPlanesAvailable` with plane info and voxel spacing.
2. `ExactImageViewer.onMPRPlanesAvailable()` shows the plane selector buttons and wires them.
3. `switchPlane(idx)` rebuilds the tile sources and frame slider for the new plane.
4. `enter3AxisMode()` hides the main viewer, shows `#mprLayout` (CSS grid), and creates three sub-viewers.

## Custom Events

Components communicate via `window.dispatchEvent` / `window.addEventListener` to avoid tight coupling:

| Event | Fired by | Payload |
|---|---|---|
| `exactMPRPlanesAvailable` | `show-image-properties.js` | `{ imageId, planes, mpp_x, mpp_y, mpp_z }` |
| `exactAnnotationLoaded` | annotation list JS | `{ annotation }` |
| `exactAnnotationTypeSelected` | type palette | `{ annotationType }` |

## Tile URL Structure

OSD constructs tile URLs from the DZI descriptor returned by `view_image`:

```
/images/image/<imageId>/<zDimension>/<frame>/tile_files/<level>/<col>_<row>.png
```

`zDimension` encodes the MPR plane (1=axial, 2=coronal, 3=sagittal) for single-file volumetric images, and the z-slice index for multi-file z-stacks. This keeps the plane in the path rather than a query parameter, which OSD would strip.

## Adding a UI Feature

1. If the feature needs backend data, add a REST endpoint or extend `image_metadata`.
2. If it reacts to metadata changes, dispatch a custom event from `show-image-properties.js` and listen in the relevant component.
3. For viewer overlays (crosshairs, highlights), create a `<canvas>` element with `pointer-events:none; z-index:100` inside the OSD container and redraw on OSD's `update-viewport` event.
4. For controls that need to hide/show alongside the frame slider, target `$(this.frameSlider.sliderElem)` — Bootstrap-slider inserts its own `.slider` DOM element and hides the original `<input>`.
