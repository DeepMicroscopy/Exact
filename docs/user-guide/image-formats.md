# Supported Image Formats

## Standard Raster Images

JPEG, PNG, BMP, and TIFF files are supported natively via Pillow. These open as single-frame, single-plane images.

## Whole Slide Images (WSI)

EXACT uses [OpenSlide](https://openslide.org/) to read WSI formats:

| Format | Extension | Vendor |
|---|---|---|
| Aperio SVS | `.svs` | Leica |
| Hamamatsu NDPI | `.ndpi` | Hamamatsu |
| Leica SCN | `.scn` | Leica |
| 3DHistech MRXS | `.mrxs` | 3DHistech |
| Ventana BIF | `.bif` | Ventana |
| Philips TIFF | `.tiff` | Philips |
| Generic TIFF | `.tif`, `.tiff` | — |
| OME-TIFF | `.ome.tiff` | — |

WSI files are served via the **DeepZoom** tile protocol: the server slices the image into 254×254 px tiles on demand, so only the tiles currently in view are transferred to the browser.

### Resolution

WSI formats store physical pixel size (microns per pixel, mpp) in their metadata. EXACT reads `openslide.mpp-x` and `openslide.mpp-y` and displays them in the image properties panel. The annotation coordinate system is always in **image pixels at level 0** (full resolution).

---

## Z-Stacks

Z-stacks are volumetric acquisitions stored as separate files per focal plane. EXACT represents them as a single logical image with `N` frames.

Z-stack files are named following the pattern `<base>_z<Z>_t<T>.<ext>`, where `Z` is the z-slice index and `T` is the time index. The server discovers all matching files and exposes them as frames.

A **frame slider** appears in the annotator. Annotations are associated with a specific frame — annotations on frame 3 are not shown when viewing frame 1.

---

## NIfTI Volumes (`.nii`, `.nii.gz`)

NIfTI is the standard format for MRI, CT, and other volumetric medical images.

### Multi-Planar Reformat (MPR)

EXACT presents NIfTI files with full MPR support. Three orthogonal reformats are available:

| Plane | Normal axis | Orientation |
|---|---|---|
| **Axial** | Z (Superior–Inferior) | Anterior at top, patient Right on left |
| **Coronal** | Y (Anterior–Posterior) | Superior at top, patient Right on left |
| **Sagittal** | X (Right–Left) | Superior at top, Anterior on left |

All planes follow **radiological convention** (matching 3D Slicer's defaults).

#### Single-plane mode

The **Axial / Coronal / Sagittal** buttons in the toolbar switch the main viewer between reformats. The frame slider updates to show the number of slices in the selected plane.

#### 3-Axis mode (⊞)

The **⊞** button opens a 2×2 grid layout with all three planes simultaneously plus a coordinate info bar:

```
┌──────────┬──────────┐
│  Axial   │ Coronal  │
├──────────┼──────────┤
│ Sagittal │ x y z mm │
└──────────┴──────────┘
```

Clicking in any plane moves the crosshair in the other two planes, allowing linked navigation through the volume. The info bar shows voxel indices and millimetre coordinates for the current crosshair position.

### 3D Segmentation

Segmentation annotations (pixel-level painting) are fully supported for NIfTI volumes across all three planes.

**How it works:**

- All segmentation data is stored as **axial tiles**. Coronal and sagittal views are derived on the fly from the stored axial data — no duplicate storage, and cross-plane consistency is automatic.
- A segmentation drawn in the axial plane is immediately visible in the coronal and sagittal planes at the corresponding position, and vice versa.
- The annotation must be a *Segmentation* vector type (type 8). Select it in the annotation type panel, then use the brush, eraser, magic wand, or fill tools to paint directly on the slice.

**Navigation tip:** after drawing in one plane, switch to another plane and scroll the frame slider to the anatomical position where you painted. The 3-Axis mode (⊞) is the most convenient way to confirm cross-plane consistency because all three planes update together.

**Anisotropic volumes:** EXACT correctly handles non-isotropic voxel spacings (e.g. thick-slice CT/MRI where the through-plane resolution is coarser than the in-plane resolution). Tile coordinates are scaled by the actual voxel dimensions, so the displayed segmentation aligns with the underlying anatomy in every plane.

### Coordinate system

NIfTI volumes are reoriented to **RAS+** (Right–Anterior–Superior) at load time using nibabel's `as_closest_canonical`. This means:

- Voxel axis 0 → increases Right
- Voxel axis 1 → increases Anterior
- Voxel axis 2 → increases Superior

Voxel sizes are derived from the affine matrix (not the raw `pixdim` header field) so they remain correct after reorientation.

### Display windowing

The display window (min/max brightness) is computed automatically from a sparse sample of the volume (1st–99th percentile of non-background voxels). This provides a good starting point for most CT and MRI acquisitions.

---

## CellVizio MKT

CellVizio `.mkt` files are produced by Mauna Kea Technologies' confocal laser endomicroscopy (CLE) systems. Each file contains a sequence of grayscale frames acquired in real time during a procedure.

EXACT reads MKT files natively (no external library required beyond pydicom). Key characteristics:

- **Frames** — each MKT file is exposed as a z-stack; the frame slider steps through the individual video frames
- **Circular field of view** — CellVizio images have a circular aperture; EXACT applies the corresponding circular mask when rendering tiles
- **Grayscale** — images are single-channel; EXACT renders them as grayscale RGBA tiles

---

## CZI (Carl Zeiss Image)

CZI files are read via `czifile` and may contain multiple scenes, channels, and z-slices. EXACT extracts the z-dimension as frames.

---

## iSyntax (Philips)

iSyntax support is available via the `docker-compose.iSyntax.yml` variant, which includes the Philips iSyntax SDK. This provides native access to `.isyntax` files.

---

## Image Registration

When multiple images represent the same specimen at different stain, modality, or time point, they can be **registered** to a common coordinate space. Registered images share a synchronized view: panning or zooming in one image moves the other.

Registration is set up in the imageset administration view. See [Registration.md](https://github.com/DeepMicroscopy/Exact/blob/master/Registration.md) for the full workflow.

---

## Adding New Formats

See the [Developer Guide — Adding Image Formats](../developer-guide/adding-image-formats.md) for instructions on integrating a custom reader.
