# Quick Start

This guide walks you from a fresh EXACT installation to your first annotated image.

## 1. Start EXACT

```bash
git clone https://github.com/DeepMicroscopy/Exact.git
cd Exact
cp exact/exact/settings.py.example exact/exact/settings.py
docker compose -f docker-compose.yml up -d --build
```

Open **http://localhost:8000/** and log in with `exact` / `exact`.

## 2. Create a Team

A **Team** is the top-level organizational unit. All ImageSets and their annotation types belong to a team.

1. On the home page, click **New Team** in the left sidebar.
2. Enter a team name and confirm.

## 3. Create an ImageSet

An **ImageSet** is a collection of related images (e.g., one study, one slide batch).

1. Click **New imageset** inside your team.
2. Enter a name and click the checkmark.
3. Open the imageset by clicking its card.

## 4. Upload Images

Inside the imageset view:

1. Click **Upload images**.
2. Drag and drop images onto the upload area, or use the file picker.

Supported formats include JPEG, PNG, BMP, and all formats supported by [OpenSlide](https://openslide.org/api/python/) (SVS, NDPI, SCN, MRXS, …), as well as NIfTI (`.nii`, `.nii.gz`).

After upload, images are processed and thumbnails are generated automatically.

## 5. Define Annotation Types

Before annotating you need at least one **Annotation Type**, which defines the shape and label of an annotation.

1. From the home page, scroll to the bottom and open **Administration**.
2. Create a **Product** (a logical grouping of annotation types for a study).
3. Inside the product, click **Add Annotation Type**.
4. Choose a name, shape (bounding box, circle, polygon, …), and color.
5. Assign the product to your imageset via **Edit imageset → Products**.

## 6. Annotate

1. Click any image thumbnail to open the annotator.
2. Select an annotation type from the left toolbar.
3. Draw the annotation on the image:
    - **Bounding box**: click and drag
    - **Circle**: click center, drag to set radius
    - **Polygon**: click to place vertices, double-click to close
4. Press **Enter** or click **Save** to confirm. Press **Escape** to cancel.

## 7. Verify

Verification is a second-pass quality check. An annotation is considered verified once a second annotator marks it correct.

1. Open the **Verification** view from the imageset page.
2. Step through annotations and press **✓** (correct) or **✗** (wrong).

## 8. Export

1. In the imageset view, open **Export**.
2. Choose or create an export format (CSV, JSON, COCO, …).
3. Download the resulting file.

## Next Steps

- [Core Concepts](../user-guide/concepts.md) — understand Teams, ImageSets, Products, and Annotation Types
- [Annotation Workflow](../user-guide/annotation-workflow.md) — detailed guide to annotating and verifying
- [API Reference](../api/index.md) — automate uploads and downloads programmatically
