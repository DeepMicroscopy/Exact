# What's New

A running log of significant additions and improvements to EXACT.

---

## July 2026 — Tabular Data

A full spreadsheet editor, attached to any image set.

**Editor**

- Dark-themed in-browser spreadsheet with resizable columns, hidden rows and columns, and double-click cell editing
- Arrow-key navigation and keyboard-driven editing
- Right-click context menus on rows, columns, and cells
- Per-column filtering with case-insensitive substring match and a clear-all button
- Stats bar shows total rows, hidden-row count, and filtered match count

**Import / Export**

- CSV import with configurable delimiter and optional first-row-as-header
- Drag-and-drop a `.csv` / `.tsv` onto the imageset page — choose between importing as a new table or attaching as an auxiliary file; a preview renders before you confirm
- CSV and XLSX export; exported XLSX files include clickable hyperlinks for all EXACT references

**Version history**

- Every save creates a new version with a comment; full diff-based storage
- Browse and preview any historical version without overwriting current data
- One-click restore

**Cell references**

- Paste any EXACT URL into a cell — it renders automatically as a rich *"Image set: …"* or *"Image: …"* link chip
- Right-click → *Insert reference…* opens a collapsible tree picker with lazy-loaded imagesets and images
- Right-click → *Remove reference* on any reference cell to clear it back to plain text
- Reference URLs stored as absolute URLs and carried through to XLSX hyperlinks

---

## June 2026 — Admin Impersonation

Superusers can temporarily act as any other user from the admin panel — useful for support, permission debugging, and reproducing user-reported issues. A persistent banner indicates the active impersonation; stopping it restores the original session cleanly.

---

## June 2026 — Folder Upload for DICOM and MRXS

Upload an entire DICOM series or MRXS slide as a folder in one step. EXACT assembles the series automatically. CellVizio format support was also updated in this cycle.

---

## May–June 2026 — Modernised UI

A broad UI refresh across the platform:

- **New imageset page** — reworked layout with an updated LightRoom v2 viewer and improved image thumbnail grid
- **Upload from image list** — drag-and-drop or browse directly from the image list without navigating away
- **Products & Types** — the annotation type management panel was redesigned and renamed for clarity
- **In-viewer search** — press <kbd>Ctrl+F</kbd> to search images within the current image set; team search also added to the main navigation bar
- **Image creator info** — the annotating user is shown alongside each image in the viewer
- **Beautified login / logout screens** and a new DeepMicroscopy logo throughout

---

## May 2026 — Team Statistics

A new statistics dashboard per team shows:

- Annotation coverage and count per image set
- Verification rates (accepted / rejected / pending)
- Per-annotator contribution breakdown

---

## May 2026 — NIfTI 3D Volume Support

Upload `.nii` and `.nii.gz` volumetric files (NIfTI-1 and NIfTI-2, optionally gzip-compressed). EXACT treats each volume as a multi-frame image:

- Axial slices rendered with z-spacing from the NIfTI voxel geometry header (`pixdim`)
- Coronal and sagittal reconstructions derived from the stored axial tiles using standard NIfTI coordinate remapping
- Z-slider in the manual registration view for cross-section alignment

---

## December 2025 — Passkeys

Passwordless authentication via FIDO2/WebAuthn — Windows Hello, Apple Passkeys, and FIDO hardware dongles.

Users register one or more keys from their profile page; subsequent logins require only a biometric gesture or key touch. Standard password login remains available alongside passkeys.

See the [Passkeys setup guide](https://github.com/DeepMicroscopy/Exact/blob/master/doc/Passkeys.md) for server configuration.

---

## Earlier features

For features predating 2025, refer to the [git log](https://github.com/DeepMicroscopy/Exact/commits/master) and the [video tutorials](index.md#video-tutorials-older-core-features) on the home page.
