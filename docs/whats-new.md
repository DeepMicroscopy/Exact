# What's New — June 2026

A summary of everything that landed in EXACT over the past few weeks.

---

## Redesigned overview UI (dark glass-morphism)

The home page (`index_v2`) and imageset view (`imageset_v2`) have been
restyled to match the dark glass-morphism aesthetic introduced in the login
screen. Cards, sidebars, and tables all use semi-transparent layered surfaces
with a consistent purple accent colour, and image names that are too long to
fit on one line now wrap to a second line instead of being hidden behind a
hover tooltip.

---

## Search — images and imagesets

Two complementary search features make it faster to find content across large
deployments:

**Search within an imageset** — a search pill in the top-right corner of the
image-set view filters the visible image cards in real time as you type.
Press `/` to focus it without reaching for the mouse.

**Global search from the home page** — each team panel in the home view has a
search pill (next to the Statistics button). Typing triggers a server-side
search across both imagesets *and* individual images for that team's data.
Results appear in-place, with team badges and direct links, without navigating
away from the overview. Press `/` to focus the active team's search field;
`Escape` clears it.

---

## File metadata in the image properties panel

The image properties panel now shows format-specific metadata automatically
for several reader backends. No configuration is required — metadata is
surfaced as soon as a matching file is opened:

| Format | Metadata shown |
|---|---|
| **Video** (MP4, AVI, …) | Codec, frame rate, duration, file size, bitrate |
| **NIfTI** | Voxel data type, repetition time TR (fMRI), description field |
| **OME-TIFF z-stack** | Pixel type, number of channels (if > 1), image name from OME-XML |
| **SlideIO** (VSI, CZI, SVS, …) | Scene name, compression type, number of channels (if > 1), pixel type, frame interval |
| **DICOM** (via SlideIO) | Modality, manufacturer, device model, acquisition date/time, series and study descriptions, patient ID, institution |

---

## User impersonation (site admins)

Site administrators can now impersonate any user directly from **Administration → User Management**. Select a user, open the *Personal* tab, and click **Impersonate**. EXACT logs you in as that user so you can reproduce reported issues or inspect their exact view of the data.

A persistent red banner is displayed on every page while impersonation is active, showing the impersonated username and a **Return to my account** button that ends the session and brings you back to the User Management page.

Safety constraints:

- Only site admins can start an impersonation session.
- You cannot impersonate yourself.
- You cannot start a second impersonation while one is already active.
- Impersonating a superuser requires superuser privileges.

---

# What's New — May 2026

A summary of everything that landed in EXACT over the past few weeks.

---

## New Annotation UI (Lightroom v2)

The annotation interface has been completely redesigned. The new "Lightroom v2"
frontend replaces the previous layout with a cleaner dark-mode-first design,
smoother drawer animations, and better use of screen space. Users can opt in via
their profile settings. All existing keyboard shortcuts and annotation tools are
fully supported in the new interface.

---

## Team Statistics

![Team Statistics](assets/whats-new/stats-placeholder.svg){ align=right width=320 }

A new **Statistics** panel in the image-set overview shows annotation progress
across the whole team. Charts (powered by Chart.js) break down counts by
annotator, by label, and over time, making it easy to spot bottlenecks and
balance workloads without leaving EXACT.

---

## Products & Types — unified management

The separate *Annotation Types* and *Products* administration pages have been
merged into a single **Products & Types** view. The consolidated interface makes
it faster to set up a new study, link products to their annotation types, and
keep the taxonomy tidy.

---

## 3D Segmentation

Pixel-level segmentation annotation is now feature-complete for volumetric
images. Draw freehand or polygon masks on any slice; the result is stored as a
canonical axial tile that can be retrieved in any viewing plane. The tool works
alongside the existing bounding-box and point annotation modes and is accessible
from the toolbar in the annotation view.

The long-standing browser freeze on Safari when the segmentation overlay was
visible on large WSIs has also been fixed (unbounded concurrent tile fetches are
now capped to a queue of four).

---

## 3-Axis MPR view for 3D volumes

NIfTI and other volumetric images now render in a three-panel
**axial / coronal / sagittal** layout. Clicking any panel cross-links the
cursor position across all three views. A **z-slider** lets you step through
slices in the registered-image overlay and in the manual-registration dialog
independently, so you can fine-tune alignment slice by slice.

---

## CellVizio MKT support

EXACT can now open Cellvizio confocal endomicroscopy recordings (`.mkt`). Files
are treated as time-series images: each frame is accessible via the frame
slider, field-of-view and probe metadata appear in the image info panel, and
the recording is navigable at the correct microns-per-pixel scale derived from
the embedded `fovx`/`fovy` parameters.

---

## Quality-of-life improvements

| Change | Detail |
|---|---|
| **Ctrl+F — search images** | Opens an in-viewer image search bar without leaving the annotation screen |
| **Upload from image list** | Images can now be uploaded directly from the image-set list view, without navigating to a separate upload page |
| **Faster frame slider** | The frame slider for time-series and z-stack images is significantly more responsive; tile prefetching has been reworked to reduce latency |
| **Screening tool stays open** | The screening drawer no longer closes automatically after an annotation is placed, reducing click count during high-volume screening sessions |
| **Opacity default 100 %** | The annotation overlay opacity slider now defaults to fully opaque on first open |
| **Wider navigator range** | The navigator viewport now covers up to 10 000 px in each direction by default, preventing blank edges when panning large WSIs |
| **Active-user indicator** | The top navigation bar shows how many users are currently active on the server |
| **Admin downtime indicator** | Site administrators can set a maintenance notice visible to all users from the admin panel |
