# EXACT — EXpert Algorithm Collaboration Tool

[![MIT license](https://img.shields.io/badge/License-MIT-blue.svg)](https://lbesson.mit-license.org/)
[![PyPI version](https://badge.fury.io/py/EXACT-Sync.svg)](https://pypi.python.org/pypi/EXACT-Sync/)

EXACT is an open-source collaborative platform for annotating images from diverse scientific domains. It is designed to handle everything from standard photographs to multi-gigapixel whole slide images (WSI) and volumetric medical images (NIfTI/MRI), and to support teams of annotators working in parallel with algorithm-in-the-loop assistance.

![EXACT annotation view](https://raw.githubusercontent.com/DeepMicroscopy/Exact/master/doc/paper/ArchitekturAndView.svg)

## Why EXACT?

| Feature | Description |
|---|---|
| **Scale** | Multi-gigapixel WSI, z-stacks, NIfTI volumes with MPR |
| **Collaboration** | Team-based access, concurrent annotation, verification workflow |
| **Algorithm integration** | Plugin system connects live deep learning models |
| **Version control** | Full annotation history, dataset versioning |
| **REST API** | Complete programmatic access via OpenAPI |
| **Offline sync** | Bi-directional sync with [SlideRunner](https://github.com/maubreville/SlideRunner) |

## Citation

If you use EXACT in your research, please cite:

> Marzahl et al. **EXACT: A collaboration toolset for algorithm-aided annotation of almost everything** — *Scientific Reports*, 2021.
> [https://doi.org/10.1038/s41598-021-83827-4](https://doi.org/10.1038/s41598-021-83827-4)

```bibtex
@Article{marzahl2021exact,
  title   = {EXACT: a collaboration toolset for algorithm-aided annotation of images with annotation version control},
  author  = {Marzahl, Christian and Aubreville, Marc and Bertram, Christof A. and others},
  journal = {Scientific Reports},
  year    = {2021},
  volume  = {11},
  pages   = {4343},
  doi     = {10.1038/s41598-021-83827-4}
}
```

## Quick Links

<div class="grid cards" markdown>

-   :material-rocket-launch: **[Quick Start](getting-started/quickstart.md)**

    Get EXACT running locally with Docker in under five minutes.

-   :material-image-multiple: **[Image Formats](user-guide/image-formats.md)**

    WSI, Z-stacks, NIfTI MPR — supported formats and how they work.

-   :material-draw: **[Annotation Workflow](user-guide/annotation-workflow.md)**

    Creating types, drawing annotations, verifying and exporting.

-   :material-api: **[API Reference](api/index.md)**

    Full OpenAPI reference for programmatic access.

</div>

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
| Cluster sounds (en) | [![](https://img.youtube.com/vi/j0IlBcmJeLE/0.jpg)](https://www.youtube.com/watch?v=j0IlBcmJeLE) |
| Annotation Versioning (en) | [![](https://img.youtube.com/vi/WeOWxXaYc0g/0.jpg)](https://www.youtube.com/watch?v=WeOWxXaYc0g) |
| Inference (en) | [![](https://img.youtube.com/vi/xP4YAp678EM/0.jpg)](https://www.youtube.com/watch?v=xP4YAp678EM) · [Code](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/blob/master/doc/Inference%20Asthma.ipynb) |
| Segmentation (en) | [![](https://img.youtube.com/vi/AMwMvMVriGw/0.jpg)](https://www.youtube.com/watch?v=AMwMvMVriGw) · [Code](https://github.com/DeepMicroscopy/Exact/blob/master/doc/Segmentation.ipynb) |
| EXACT Media Files (en) | [![](https://img.youtube.com/vi/ygOY-CuSQ5k/0.jpg)](https://www.youtube.com/watch?v=ygOY-CuSQ5k) |
| Datasets (en) | [![](https://img.youtube.com/vi/hi23nhz0rWQ/0.jpg)](https://www.youtube.com/watch?v=hi23nhz0rWQ) |
| Image sets and uploads (en) | [![](https://img.youtube.com/vi/VTBIyTs9lmk/0.jpg)](https://www.youtube.com/watch?v=VTBIyTs9lmk) |
| Viewer and plugin functions (en) | [![](https://img.youtube.com/vi/OJBE9JtsbIE/0.jpg)](https://www.youtube.com/watch?v=OJBE9JtsbIE) |
| Image registration (en) | [![](https://img.youtube.com/vi/hduXtr6EaMA/0.jpg)](https://www.youtube.com/watch?v=hduXtr6EaMA) |
| Collaborative annotation features (de) | [![](https://img.youtube.com/vi/qsX7MoYhDEM/0.jpg)](https://www.youtube.com/watch?v=qsX7MoYhDEM) |
| Teams, products, annotation types (de) | [![](https://img.youtube.com/vi/yr6h2OffThU/0.jpg)](https://www.youtube.com/watch?v=yr6h2OffThU) |
| Screening plugin for WSI (de) | [![](https://img.youtube.com/vi/w7GHTEP2AYo/0.jpg)](https://www.youtube.com/watch?v=w7GHTEP2AYo) |
| Sync with SlideRunner (en) | [![](https://img.youtube.com/vi/ehrfC04okyE/0.jpg)](https://www.youtube.com/watch?v=ehrfC04okyE) |
| Advanced polygon operations (de) | [![](https://img.youtube.com/vi/xVn9ghDQz1A/0.jpg)](https://www.youtube.com/watch?v=xVn9ghDQz1A) |
| REST API example | `pip install EXACT-Sync` · [Code](https://github.com/ChristianMarzahl/EXACT-Sync) · [Notebooks](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/tree/master/doc/) · [Postman](https://documenter.getpostman.com/view/11308910/TVYF6xZo) |
