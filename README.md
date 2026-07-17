<div align="center">

# EXACT

**Open-source platform for collaborative annotation of medical and scientific images**

[![PyPI](https://badge.fury.io/py/EXACT-Sync.svg)](https://pypi.python.org/pypi/EXACT-Sync/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://lbesson.mit-license.org/)
[![DOI](https://img.shields.io/badge/DOI-10.1038%2Fs41598--021--83827--4-green.svg)](https://doi.org/10.1038/s41598-021-83827-4)

</div>

<img width="1400" alt="EXACT — collaborative medical image annotation" src="https://github.com/user-attachments/assets/460f852e-a20c-411f-b0ea-070a0c83d612" />

EXACT (EXpert Algorithm Collaboration Tool) is a web-based platform for labeling whole slide images, 3D volumes, DICOM series, video, and standard raster images — built for multidisciplinary research teams that need version control, AI-assisted workflows, and a full REST API.

---

## What's New

### Tabular Data *(2026)*

Attach structured spreadsheet data directly to any image set — a full in-browser spreadsheet editor with version history.

- CSV and XLSX import / export with a dark-themed spreadsheet editor
- Full version history with diff-based storage and one-click restore
- Per-column filtering, column reordering, hidden rows and columns
- Drag-and-drop CSV onto the imageset page to import as a table or attach as an auxiliary file
- Paste any EXACT URL into a cell — it renders as a rich reference chip (*"Image set: Tumor Slides"*)
- Right-click context menu to insert or remove references, with a tree picker for lazy-loaded imagesets and images
- Exported XLSX files include clickable hyperlinks for all EXACT references

### Admin Impersonation *(2026)*

Superusers can temporarily act as any other user for support and debugging. A persistent banner makes the impersonation state clear; the original session is fully restored on exit.

### Folder Upload for DICOM and MRXS *(2026)*

Upload an entire DICOM series or MRXS dataset as a folder — EXACT assembles the series automatically.

### Team Statistics *(2026)*

A new statistics dashboard shows annotation progress per team: coverage, verification rates, and annotator breakdowns.

### Search *(2026)*

Full-text search within image sets (press <kbd>Ctrl+F</kbd>) and across teams from the main navigation.

### Modernised UI *(2026)*

- Refreshed imageset page with a new LightRoom v2 viewer and improved image list
- Reworked annotation type management under *Products & Types*
- Upload images directly from the image list view
- Image creator information shown in the viewer
- Beautified login and logout screens
- New logo

### NIfTI 3D Volume Support *(2026)*

Upload `.nii` and `.nii.gz` volumetric files. The viewer renders axial slices with z-scaling from the NIfTI voxel geometry header; coronal and sagittal reconstructions use standard NIfTI coordinate remapping. Includes a z-slider for manual cross-section registration.

### Passkeys *(2025)*

Passwordless login via FIDO2/WebAuthn — Windows Hello, Apple Passkeys, and hardware security keys. Users register keys in their profile and sign in with a single gesture. See [Passkeys setup guide](doc/Passkeys.md).

---

## Features

| Area | What EXACT provides |
|------|---------------------|
| **Image types** | WSI via OpenSlide, DICOM, NIfTI (`.nii`/`.nii.gz`), CZI, CellVizio, MRXS, Olympus VSI, PNG, JPG, MP4, AVI |
| **Annotation** | Bounding box · circle · polygon · segmentation tiles · paint brush · scissors & glue · knife split |
| **Collaboration** | Teams, shared image sets, concurrent editing, annotation verification workflow |
| **Version control** | Full annotation history with diff-based storage and per-version links |
| **Tabular data** | Spreadsheet editor per image set, CSV/XLSX import/export, cell-level references |
| **AI integration** | Plugin system for algorithm-assisted labeling; density maps; segmentation overlays |
| **Screening mode** | Tile-by-tile WSI review with keyboard-driven navigation |
| **REST API** | Browsable DRF API + dynamic OpenAPI/Swagger schema; [EXACT-Sync](https://github.com/DeepMicroscopy/EXACT-Sync) Python client |
| **Authentication** | Password, passkeys (FIDO2/WebAuthn), optional LDAP |
| **Offline sync** | Bidirectional sync with [SlideRunner](https://github.com/maubreville/SlideRunner) desktop tool |
| **Export** | Configurable export formats, annotation maps, density maps |
| **Caching** | Redis-backed tile and session caching — see [Caching docs](redis/CACHING.md) |

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/DeepMicroscopy/Exact.git
cp exact/exact/settings.py.example exact/exact/settings.py
docker-compose -f docker-compose.yml up -d --build
```

Navigate to **http://localhost:8000/** · Default credentials: `exact` / `exact`

#### Production

```bash
cp env.dev env.prod && cp env.dev.db env.prod.db
# Edit env.prod, env.prod.db, and settings.py for your environment

docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml exec web python3 manage.py migrate --noinput
docker-compose -f docker-compose.prod.yml exec web python3 manage.py createsuperuser
docker-compose -f docker-compose.prod.yml exec web python3 manage.py collectstatic --no-input --clear
```

Navigate to **http://localhost:1337/**

#### After each upgrade

```bash
python3 manage.py migrate
python3 manage.py compilemessages
python3 manage.py collectstatic
```

See [UPGRADE.md](UPGRADE.md) for version-specific migration notes.

### Native (macOS / Linux)

<details>
<summary>Expand native install instructions</summary>

**Prerequisites (Ubuntu/Debian)**

```bash
apt-get update && apt-get install \
  python3-pip dos2unix python3-openslide python3-opencv libvips libvips-dev
sudo apt install postgresql
```

> **Ubuntu 20.04:** Known [issue](https://github.com/libvips/libvips/issues/1401) with OpenSlide — rebuild [pixman](https://gitlab.freedesktop.org/pixman/pixman/-/blob/master/INSTALL) to fix it.

**Database**

```bash
sudo -iu postgres psql
```
```sql
CREATE USER exact PASSWORD 'exact';
CREATE DATABASE exact WITH OWNER exact ENCODING UTF8;
```

**Application**

```bash
pip3 install -r requirements.txt
cp exact/exact/settings.py.example exact/exact/settings.py
# Edit: SECRET_KEY · DEBUG · ALLOWED_HOSTS · database · UPLOAD_FS_GROUP

python3 manage.py migrate
python3 manage.py createsuperuser
python3 manage.py runserver
```

**Email verification** — add to `settings.py`:

```python
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST     = 'smtp.googlemail.com'
EMAIL_PORT     = '587'
EMAIL_HOST_USER     = 'you@gmail.com'
EMAIL_HOST_PASSWORD = 'your-password'
EMAIL_USE_TLS  = True
```

</details>

---

## Keyboard Shortcuts

### Annotation Viewer

| Key | Action |
|-----|--------|
| <kbd>Del</kbd> <kbd>x</kbd> | Delete selected annotation |
| <kbd>Escape</kbd> | Cancel editing |
| <kbd>Enter</kbd> | Confirm / save |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Undo |
| <kbd>c</kbd> | Toggle annotation mode |
| <kbd>y</kbd> | Toggle annotation visibility |
| <kbd>b</kbd> | Push annotation type to background |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Draw on top of existing annotation |
| <kbd>0</kbd>–<kbd>4</kbd> | Change local annotation label |
| <kbd>Shift</kbd>+<kbd>0</kbd>–<kbd>4</kbd> | Change global annotation label |
| <kbd>q</kbd> / <kbd>e</kbd> | Previous / next image |
| <kbd>Shift</kbd>+<kbd>q</kbd> / <kbd>e</kbd> | Previous / next frame |
| <kbd>r</kbd> | Rotate image |
| <kbd>f</kbd> | Flip image |
| <kbd>s</kbd> | Scissors — delete from selection |
| <kbd>g</kbd> | Glue — add to selection |
| <kbd>d</kbd> | Knife — split object |
| <kbd>Shift</kbd>+scroll | Resize paint brush |
| Arrow keys | Pan viewing window |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> | Search images |

### Screening Viewer

| Key | Action |
|-----|--------|
| <kbd>a</kbd> / <kbd>d</kbd> | Screen left / right tile |
| <kbd>w</kbd> / <kbd>s</kbd> | Screen up / down tile |
| <kbd>j</kbd> / <kbd>l</kbd> | Navigate left / right tile |
| <kbd>i</kbd> / <kbd>k</kbd> | Navigate up / down tile |

---

## REST API

- **Browsable API:** https://exact.cs.fau.de/api/v1/
- **Python client:** `pip install EXACT-Sync` — [GitHub](https://github.com/DeepMicroscopy/EXACT-Sync) · [Notebooks](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/tree/master/doc/)
- **OpenAPI schema:** `GET /api/v1/openapi` — import [EXACT-API.yml](./exact/EXACT-API.yml) into [Swagger Editor](https://editor.swagger.io)

**Authentication**

```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"username":"exact","password":"top_secret"}' \
  http://127.0.0.1:8000/api/auth/token/login/
```

**Query examples**

```
# Filter by name, expand related objects
GET /api/v1/images/image_sets/?name__contains=Tumor&expand=product_set,main_annotation_type

# Select specific fields
GET /api/v1/images/image_sets/?fields=id,name

# Exclude fields
GET /api/v1/images/image_sets/?omit=images,product_set
```

<details>
<summary>All available endpoints</summary>

```
users/users               /api/v1/users/users/
users/teams               /api/v1/users/teams/
users/team_membership     /api/v1/users/team_membership/
images/images             /api/v1/images/images/
images/image_sets         /api/v1/images/image_sets/
images/set_tags           /api/v1/images/set_tags/
images/screening_modes    /api/v1/images/screening_modes/
annotations/annotations        /api/v1/annotations/annotations/
annotations/annotation_types   /api/v1/annotations/annotation_types/
annotations/verifications      /api/v1/annotations/verifications/
annotations/log_image_actions  /api/v1/annotations/log_image_actions/
administration/products        /api/v1/administration/products/
```

</details>

---

## Citation

If you use EXACT in your research, please cite:

> Marzahl et al. **EXACT: A collaboration toolset for algorithm-aided annotation of almost everything.** *Scientific Reports* 11, 4343 (2021). https://doi.org/10.1038/s41598-021-83827-4

```bibtex
@Article{marzahl2021exact,
  title   = {EXACT: a collaboration toolset for algorithm-aided annotation of images with annotation version control},
  author  = {Marzahl, Christian and Aubreville, Marc and Bertram, Christof A. and Maier, Jennifer
             and Bergler, Christian and Kr{\"o}ger, Christine and Voigt, J{\"o}rn
             and Breininger, Katharina and Klopfleisch, Robert and Maier, Andreas},
  journal = {Scientific Reports},
  year    = {2021},
  volume  = {11},
  pages   = {4343},
  doi     = {10.1038/s41598-021-83827-4}
}
```

Built on [imagetagger](https://robocup.informatik.uni-hamburg.de/wp-content/uploads/2018/11/imagetagger_paper.pdf) by Fiedler et al. (RoboCup 2018).

---

## Documentation

Notebooks for API usage, inference, segmentation, density maps, cluster workflows, and more live in [`doc/`](doc/) and can be viewed at [NBViewer](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/tree/master/doc/).

<details>
<summary>Video tutorials (older, cover core features)</summary>

| Topic | Video |
|-------|-------|
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
| SlideRunner sync | [![](https://img.youtube.com/vi/ehrfC04okyE/0.jpg)](https://www.youtube.com/watch?v=ehrfC04okyE) |

</details>

<details>
<summary>Dependencies</summary>

| Library | License |
|---------|---------|
| [Django](https://www.djangoproject.com/) | BSD |
| [djangorestframework](https://www.django-rest-framework.org/) | BSD |
| [OpenSlide Python](http://openslide.org/) | LGPL 2.1 |
| [OpenSeadragon](https://openseadragon.github.io/) | BSD-3 |
| [numpy](https://www.numpy.org/) | BSD |
| [opencv-python](https://github.com/skvark/opencv-python) | MIT |
| [Pillow](http://python-pillow.org) | PIL License |
| [openpyxl](https://openpyxl.readthedocs.io/) | MIT |
| [Bootstrap](https://getbootstrap.com/) | BSD |
| [jQuery](https://jquery.com/) | MIT |
| [nibabel](https://nipy.org/nibabel/) | MIT |
| [psycopg2](http://initd.org/psycopg/) | LGPL |
| [gunicorn](http://gunicorn.org/) | MIT |

</details>

---

<sub>MIT License · © DeepMicroscopy · <a href="https://exact.cs.fau.de">exact.cs.fau.de</a></sub>
