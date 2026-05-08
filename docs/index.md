---
hide:
  - navigation
  - toc
---

<div class="hero" markdown>

**Collaborative annotation of images at any scale —**
whole slide histopathology, MRI volumes, z-stacks, and more.

[![MIT license](https://img.shields.io/badge/License-MIT-blue.svg)](https://lbesson.mit-license.org/)
[![PyPI](https://badge.fury.io/py/EXACT-Sync.svg)](https://pypi.python.org/pypi/EXACT-Sync/)
[![Paper](https://img.shields.io/badge/Scientific_Reports-2021-green)](https://doi.org/10.1038/s41598-021-83827-4)

</div>

<div class="grid cards" markdown>

-   🚀 **Quick Start**

    ---
    Get EXACT running with Docker in minutes.

    [→ Installation](getting-started/installation.md)

-   ✏️ **Annotation Workflow**

    ---
    Draw, verify, and export annotations on images of any size.

    [→ Workflow guide](user-guide/annotation-workflow.md)

-   🖼️ **Image Formats**

    ---
    WSI, z-stacks, NIfTI MPR, CZI, iSyntax — and extensible for more.

    [→ Supported formats](user-guide/image-formats.md)

-   📡 **REST API**

    ---
    Full OpenAPI reference and Python client examples.

    [→ API reference](api/index.md)

-   🧩 **Plugin System**

    ---
    Connect your trained models to EXACT via EXACT-Sync.

    [→ Plugin guide](developer-guide/plugins.md)

-   🔧 **Developer Guide**

    ---
    Architecture, custom image formats, frontend internals.

    [→ Architecture](developer-guide/architecture.md)

</div>

---

## Why EXACT?

| | |
|---|---|
| **Scale** | Multi-gigapixel WSI, NIfTI volumes with axial / coronal / sagittal MPR, z-stacks |
| **Collaboration** | Team-based access, concurrent annotation, two-pass verification |
| **Algorithm integration** | Plugin system connects live deep-learning models — draw predictions, verify, retrain |
| **Version control** | Full annotation history and dataset versioning |
| **REST API** | Complete programmatic access; Python client via [EXACT-Sync](https://github.com/DeepMicroscopy/EXACT-Sync) |
| **Offline sync** | Bi-directional sync with [SlideRunner](https://github.com/maubreville/SlideRunner) |

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

## Video Tutorials

| Description | Video |
|---|---|
| EXACT installation with Docker (en) | [![](https://img.youtube.com/vi/-YH5cnWVrDg/0.jpg)](https://www.youtube.com/watch?v=-YH5cnWVrDg) |
| EXACT First steps (en) | [![](https://img.youtube.com/vi/F3lV-IvT1M4/0.jpg)](https://www.youtube.com/watch?v=F3lV-IvT1M4) |
| EXACT Product and Annotation type definition (en) | [![](https://img.youtube.com/vi/4XdWLaqy9UA/0.jpg)](https://www.youtube.com/watch?v=4XdWLaqy9UA) |
| Study and annotation modes (en) | [![](https://img.youtube.com/vi/wjV-wHbrRjQ/0.jpg)](https://www.youtube.com/watch?v=wjV-wHbrRjQ) · [Code](https://github.com/DeepMicroscopy/Exact/blob/master/doc/DownloadStudyAnnotations.ipynb) |
| AnnotationMaps (en) | [![](https://img.youtube.com/vi/GAjvOSkLW8Q/0.jpg)](https://www.youtube.com/watch?v=GAjvOSkLW8Q) · [Code](https://github.com/DeepMicroscopy/Exact/blob/master/doc/AnnotationMap.ipynb) |
| DensityMaps (en) | [![](https://img.youtube.com/vi/BLdX6syS_z0/0.jpg)](https://www.youtube.com/watch?v=BLdX6syS_z0) · [Code](https://github.com/DeepMicroscopy/Exact/blob/master/doc/Create_DensityWSI-Equine.ipynb) |
| Cluster annotations (en) | [![](https://img.youtube.com/vi/Wvz-Nv4dNOE/0.jpg)](https://www.youtube.com/watch?v=Wvz-Nv4dNOE) · [Code](https://github.com/DeepMicroscopy/Exact/blob/master/doc/ClusterCells.ipynb) |
| Annotation Versioning (en) | [![](https://img.youtube.com/vi/WeOWxXaYc0g/0.jpg)](https://www.youtube.com/watch?v=WeOWxXaYc0g) |
| Inference (en) | [![](https://img.youtube.com/vi/xP4YAp678EM/0.jpg)](https://www.youtube.com/watch?v=xP4YAp678EM) · [Code](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/blob/master/doc/Inference%20Asthma.ipynb) |
| Segmentation (en) | [![](https://img.youtube.com/vi/AMwMvMVriGw/0.jpg)](https://www.youtube.com/watch?v=AMwMvMVriGw) · [Code](https://github.com/DeepMicroscopy/Exact/blob/master/doc/Segmentation.ipynb) |
| EXACT Media Files (en) | [![](https://img.youtube.com/vi/ygOY-CuSQ5k/0.jpg)](https://www.youtube.com/watch?v=ygOY-CuSQ5k) |
| Datasets (en) | [![](https://img.youtube.com/vi/hi23nhz0rWQ/0.jpg)](https://www.youtube.com/watch?v=hi23nhz0rWQ) |
| Image sets and uploads (en) | [![](https://img.youtube.com/vi/VTBIyTs9lmk/0.jpg)](https://www.youtube.com/watch?v=VTBIyTs9lmk) |
| Viewer and plugin functions (en) | [![](https://img.youtube.com/vi/OJBE9JtsbIE/0.jpg)](https://www.youtube.com/watch?v=OJBE9JtsbIE) |
| Image registration (en) | [![](https://img.youtube.com/vi/hduXtr6EaMA/0.jpg)](https://www.youtube.com/watch?v=hduXtr6EaMA) |
| Sync with SlideRunner (en) | [![](https://img.youtube.com/vi/ehrfC04okyE/0.jpg)](https://www.youtube.com/watch?v=ehrfC04okyE) |
| Advanced polygon operations (de) | [![](https://img.youtube.com/vi/xVn9ghDQz1A/0.jpg)](https://www.youtube.com/watch?v=xVn9ghDQz1A) |
| REST API example | `pip install EXACT-Sync` · [Code](https://github.com/ChristianMarzahl/EXACT-Sync) · [Notebooks](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/tree/master/doc/) · [Postman](https://documenter.getpostman.com/view/11308910/TVYF6xZo) |
