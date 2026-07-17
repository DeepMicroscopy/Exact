---
hide:
  - navigation
  - toc
---

<div class="hero" markdown>

<img src="assets/deepmicroscopy-logo.png" class="hero-logo" alt="DeepMicroscopy">

**Collaborative annotation of images at any scale —**
whole slide histopathology, 3D volumes, DICOM series, tabular data, and more.

[![MIT license](https://img.shields.io/badge/License-MIT-blue.svg)](https://lbesson.mit-license.org/)
[![PyPI](https://badge.fury.io/py/EXACT-Sync.svg)](https://pypi.python.org/pypi/EXACT-Sync/)
[![Paper](https://img.shields.io/badge/Scientific_Reports-2021-green)](https://doi.org/10.1038/s41598-021-83827-4)

</div>

<div class="grid cards" markdown>

-   :material-rocket-launch-outline: **Quick Start**

    ---
    Get EXACT running with Docker in minutes.

    [:octicons-arrow-right-24: Installation](getting-started/installation.md)

-   :material-draw: **Annotation Workflow**

    ---
    Draw, verify, and export annotations on images of any size.

    [:octicons-arrow-right-24: Workflow guide](user-guide/annotation-workflow.md)

-   :material-image-multiple-outline: **Image Formats**

    ---
    WSI, NIfTI MPR, DICOM, CZI, iSyntax — extensible for more.

    [:octicons-arrow-right-24: Supported formats](user-guide/image-formats.md)

-   :material-table: **Tabular Data**

    ---
    Attach spreadsheet data to any image set — with version history and EXACT references.

    [:octicons-arrow-right-24: What's New](whats-new.md)

-   :material-api: **REST API**

    ---
    Full OpenAPI reference and Python client examples.

    [:octicons-arrow-right-24: API reference](api/index.md)

-   :material-puzzle-outline: **Plugin System**

    ---
    Connect trained models to EXACT via EXACT-Sync.

    [:octicons-arrow-right-24: Plugin guide](developer-guide/plugins.md)

</div>

---

## Why EXACT?

| | |
|---|---|
| **Scale** | Multi-gigapixel WSI, NIfTI volumes with axial / coronal / sagittal MPR, z-stacks |
| **Collaboration** | Team-based access, concurrent annotation, two-pass verification |
| **Tabular data** | Spreadsheet editor per image set — CSV/XLSX, version history, cell-level image references |
| **Algorithm integration** | Plugin system connects live deep-learning models — draw predictions, verify, retrain |
| **Version control** | Full annotation history and dataset versioning |
| **Authentication** | Password login, passkeys (FIDO2/WebAuthn), optional LDAP |
| **REST API** | Complete programmatic access; Python client via [EXACT-Sync](https://github.com/DeepMicroscopy/EXACT-Sync) |
| **Offline sync** | Bi-directional sync with [SlideRunner](https://github.com/maubreville/SlideRunner) |

---

## Recent Additions

!!! tip "Full changelog"
    See [What's New](whats-new.md) for the complete feature history.

**Tabular Data** *(July 2026)* — A full spreadsheet editor attached to any image set: CSV/XLSX import and export, diff-based version history, per-column filtering, and cell-level references to EXACT images and image sets that render as rich link chips.

**Admin Impersonation** *(June 2026)* — Superusers can temporarily act as any other user for support and debugging, with a clear persistent banner.

**Folder Upload** *(June 2026)* — Upload an entire DICOM series or MRXS dataset as a folder; EXACT assembles the series automatically.

**Team Statistics** *(May 2026)* — Dashboard showing annotation coverage, verification rates, and per-annotator breakdowns.

**UI Refresh** *(May–June 2026)* — New imageset page, LightRoom v2 viewer, direct uploads from the image list, reworked *Products & Types* panel, in-viewer search (<kbd>Ctrl+F</kbd>), new logo.

**NIfTI 3D Volumes** *(May 2026)* — Upload `.nii` / `.nii.gz` volumetric files. Axial, coronal, and sagittal views derived from NIfTI voxel geometry; z-slider for cross-section registration.

**Passkeys** *(December 2025)* — Passwordless login via FIDO2/WebAuthn — Windows Hello, Apple Passkeys, and hardware security keys.

---

## Citation

```bibtex
@Article{marzahl2021exact,
  title   = {EXACT: a collaboration toolset for algorithm-aided annotation
             of images with annotation version control},
  author  = {Marzahl, Christian and Aubreville, Marc and Bertram, Christof A.
             and Maier, Jennifer and Bergler, Christian and Kr{\"o}ger,
             Christine and Voigt, J{\"o}rn and Breininger, Katharina and
             Klopfleisch, Robert and Maier, Andreas},
  journal = {Scientific Reports},
  year    = {2021},
  volume  = {11},
  pages   = {4343},
  doi     = {10.1038/s41598-021-83827-4}
}
```

---

??? note "Video tutorials (older — core features)"

    | Description | Video |
    |---|---|
    | Installation with Docker | [![](https://img.youtube.com/vi/-YH5cnWVrDg/0.jpg)](https://www.youtube.com/watch?v=-YH5cnWVrDg) |
    | First steps | [![](https://img.youtube.com/vi/F3lV-IvT1M4/0.jpg)](https://www.youtube.com/watch?v=F3lV-IvT1M4) |
    | Products & annotation type setup | [![](https://img.youtube.com/vi/4XdWLaqy9UA/0.jpg)](https://www.youtube.com/watch?v=4XdWLaqy9UA) |
    | Study and annotation modes | [![](https://img.youtube.com/vi/wjV-wHbrRjQ/0.jpg)](https://www.youtube.com/watch?v=wjV-wHbrRjQ) |
    | Annotation maps | [![](https://img.youtube.com/vi/GAjvOSkLW8Q/0.jpg)](https://www.youtube.com/watch?v=GAjvOSkLW8Q) |
    | Density maps | [![](https://img.youtube.com/vi/BLdX6syS_z0/0.jpg)](https://www.youtube.com/watch?v=BLdX6syS_z0) |
    | Cluster annotations | [![](https://img.youtube.com/vi/Wvz-Nv4dNOE/0.jpg)](https://www.youtube.com/watch?v=Wvz-Nv4dNOE) |
    | Annotation versioning | [![](https://img.youtube.com/vi/WeOWxXaYc0g/0.jpg)](https://www.youtube.com/watch?v=WeOWxXaYc0g) |
    | Inference | [![](https://img.youtube.com/vi/xP4YAp678EM/0.jpg)](https://www.youtube.com/watch?v=xP4YAp678EM) |
    | Segmentation | [![](https://img.youtube.com/vi/AMwMvMVriGw/0.jpg)](https://www.youtube.com/watch?v=AMwMvMVriGw) |
    | Image registration | [![](https://img.youtube.com/vi/hduXtr6EaMA/0.jpg)](https://www.youtube.com/watch?v=hduXtr6EaMA) |
    | Sync with SlideRunner | [![](https://img.youtube.com/vi/ehrfC04okyE/0.jpg)](https://www.youtube.com/watch?v=ehrfC04okyE) |
    | Advanced polygon operations (de) | [![](https://img.youtube.com/vi/xVn9ghDQz1A/0.jpg)](https://www.youtube.com/watch?v=xVn9ghDQz1A) |
