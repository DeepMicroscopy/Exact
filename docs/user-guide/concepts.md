# Core Concepts

## Data Hierarchy

```
Team
└── ImageSet (one or more)
    └── Image (one or more)
        └── Annotation (zero or more)
            └── Verification (zero or more)
```

### Team

A **Team** is a group of users who share access to a set of ImageSets. Each team has one or more **admins** who can manage membership. Users can belong to multiple teams.

### ImageSet

An **ImageSet** groups related images — for example, all slides from one study or one batch. Key properties:

| Property | Meaning |
|---|---|
| **Public** | Anyone can view (read-only) without logging in |
| **Public collaboration** | Anyone can annotate, not just team members |
| **Priority** | Flags the set as high / low labeling priority |
| **Image lock** | Prevents new uploads when set |
| **Products** | Which annotation type groups apply to this set |

### Image

A single file inside an ImageSet. EXACT stores the file on disk and records metadata (width, height, resolution, number of frames, …) at upload time.

Multi-dimensional images are represented as:

- **Z-stacks** — multiple focal planes or time points, navigated with a frame slider
- **NIfTI volumes** — full 3D volumes with axial / coronal / sagittal MPR views

### Annotation

An **Annotation** marks a region of interest inside an image. It has:

| Property | Meaning |
|---|---|
| **Annotation Type** | Shape, label, and color |
| **Vector** | The coordinates (bounding box corners, polygon vertices, …) |
| **Frame** | Which frame / plane the annotation lives on |
| **Concealed / Blurred** | Flags for special rendering |
| **Verified** | Whether verification has been completed |

---

## Annotation Types and Products

An **Annotation Type** defines the *shape* and *semantic label* of a class of annotations. It belongs to a **Product**.

A **Product** is a named collection of annotation types for a particular study or labeling task (e.g., "Mitosis detection" with types "Mitotic figure" and "Mitosis-like"). Products are assigned to ImageSets to control which labels are available in the annotator.

### Shape types

| Type | Description |
|---|---|
| Bounding box | Axis-aligned rectangle |
| Circle | Center + radius |
| Polygon | Arbitrary closed or open contour |
| Line | Open polyline |
| Point | Single coordinate |
| Global | Image-level label (no spatial extent) |

---

## Verification Workflow

The verification workflow gives a second annotator a chance to confirm or reject each annotation:

1. Annotator A draws an annotation → status: *unverified*
2. Annotator B opens the **Verification** view
3. B clicks ✓ → status: *verified* (or ✗ → *rejected*)

Rejected annotations can be corrected and re-submitted for verification. This creates a lightweight quality-control loop without a separate review system.

---

## Plugins

Plugins are server-side jobs that process images or annotations automatically. Typical uses:

- Run inference with a trained model and insert predictions as annotations
- Compute statistics over existing annotations
- Generate heatmaps or density maps

Plugins are managed under **Administration → Plugins** and can be triggered manually from the imageset view or via the REST API.

---

## REST API

EXACT exposes a full REST API at `/api/v1/`. Authentication uses token-based auth:

```bash
# Obtain a token
curl -X POST http://localhost:8000/api/auth/token/login/ \
  -H 'Content-Type: application/json' \
  -d '{"username": "exact", "password": "exact"}'

# Use the token
curl http://localhost:8000/api/v1/images/image_sets/ \
  -H 'Authorization: Token <your-token>'
```

See the [API Reference](../api/index.md) for the full endpoint list.
