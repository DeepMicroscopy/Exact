# Annotation Workflow

## Opening an Image

From the home page, click any imageset card to open the imageset view. Click an image thumbnail to open the annotator.

The annotator shows:

- **Left panel** — annotation type selector, layer controls, plugin triggers
- **Center** — the OpenSeaDragon image viewer
- **Right panel** — image properties, annotation list, export

## Drawing Annotations

### Selecting a type

Click the annotation type in the left panel to make it active. The cursor changes to indicate draw mode.

### Shape-specific controls

=== "Bounding box"
    Click and drag to draw the box. Release to confirm the size. Resize with the corner handles.

=== "Circle"
    Click the center point, then drag outward to set the radius.

=== "Polygon"
    Click to place each vertex. Double-click the last vertex (or click the first vertex) to close the shape.
    
    After closing, individual vertices can be dragged to adjust the contour.

=== "Line"
    Click to place each point along the line. Double-click to finish.

=== "Global (image-level)"
    Global annotations have no spatial extent. Clicking the annotation type in the panel toggles the label on/off for the whole image.

### Confirming and cancelling

| Action | Key |
|---|---|
| Confirm / save | `Enter` |
| Cancel (discard) | `Escape` |
| Undo last vertex (polygon) | `Ctrl+Z` |

## Editing Existing Annotations

Click an annotation to select it. Selection handles appear:

- **Drag the body** to move
- **Drag a handle** to resize / reshape
- **Del** or **x** to delete

### Polygon edit tools

When a polygon annotation is selected, three additional tools activate:

| Key | Tool | Function |
|---|---|---|
| `s` | Scissor | Subtract a drawn region from the annotation |
| `g` | Glue | Add a drawn region to the annotation |
| `d` | Knife | Draw a cut line to split the annotation into two |

## Navigating Large Images

| Action | Control |
|---|---|
| Pan | Click and drag (outside annotation) |
| Zoom | Mouse wheel |
| Zoom reset | Double-click background |
| Previous image | `q` |
| Next image | `e` |
| Previous frame (z-stack) | `Shift+q` |
| Next frame (z-stack) | `Shift+e` |
| Move viewport | Arrow keys |

## Frame Slider (Z-Stacks and NIfTI)

For multi-frame images a **frame slider** appears above the viewer. Drag it or use `Shift+q` / `Shift+e` to step through frames.

For NIfTI volumes, a **plane selector** appears (Axial / Coronal / Sagittal / ⊞ 3-Axis). The 3-axis mode opens a 2×2 grid with all three reformats and linked crosshair navigation — click any plane to jump to that position in the other two.

## Segmentation Tool (Pixel-Level Painting)

The segmentation tool is available for annotation types with vector type *Segmentation*. Select such a type in the left panel to reveal the painting palette.

### Tools

| Button | Tool | Description |
|---|---|---|
| Hand | Pan | Navigate without painting (default) |
| Brush | Brush | Paint filled circles; adjust size with the slider |
| Eraser | Eraser | Remove painted pixels |
| Wand | Magic wand | Flood-select pixels with similar intensity |
| Bucket | Fill | Flood-fill a connected region |

### 3D segmentation on NIfTI volumes

Segmentation works in **all three MPR planes** (Axial, Coronal, Sagittal):

1. Select the plane using the plane selector buttons.
2. Navigate to the slice you want to annotate using the frame slider.
3. Paint with the brush or other tools.
4. Switch to another plane and scroll to the anatomical position where you painted — the segmentation appears there automatically.

Annotations drawn in any plane are stored as axial tiles and derived on the fly for the other planes, so the data is always consistent. The **3-Axis mode (⊞)** is the easiest way to verify cross-plane consistency: all three views update simultaneously as you navigate.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+Z` | Undo last stroke |

## Verification

Open the **Verification** view from the imageset page. The view steps through unverified annotations one by one:

| Key / Button | Action |
|---|---|
| ✓ | Mark as correct (verified) |
| ✗ | Mark as wrong (rejected) |

Rejected annotations are returned to the annotator's queue. Only verified annotations are included in exports by default (this is configurable per export format).

## Annotation Visibility and Modes

| Key | Function |
|---|---|
| `y` | Toggle annotation visibility |
| `c` | Toggle annotation mode (draw / select) |
| `b` | Push selected annotation type to background layer |
| `Ctrl+a` | Draw annotation on top of an existing one |
| `0–4` | Change label of local annotation |
| `Shift+0–4` | Change label of global annotation |

## Exporting Annotations

1. Open the imageset and click **Export**.
2. Select an export format or create one via **Administration → Export Formats**.
3. Click **Download** to get a ZIP with the label files.

Common export formats: CSV, JSON, COCO, Pascal VOC. Custom formats can be defined with Python templates.

## Screening Mode

The screening plugin provides a structured grid-based review of a WSI, ensuring full coverage:

| Key | Function |
|---|---|
| `a` | Screen left tile |
| `d` | Screen right tile |
| `w` | Screen up tile |
| `s` | Screen down tile |
| `j/l/i/k` | Navigate to tile (no marking) |
