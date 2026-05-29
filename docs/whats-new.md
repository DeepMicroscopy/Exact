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
