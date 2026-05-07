from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image

from util.enums import FrameType, PlaneType
import openslide


@dataclass
class NIfTISlide:
    """OpenSlide-compatible reader for NIfTI (.nii, .nii.gz) volumetric images.

    Supports axial, coronal, and sagittal reformats via the `plane` parameter
    on read_region / dimensions_for_plane / nframes_for_plane.

    Data is always reoriented to RAS+ at load time so that:
      axis 0 (X) increases Right,  axis 1 (Y) increases Anterior,
      axis 2 (Z) increases Superior.

    Display uses radiological convention (Anterior / Superior at top,
    patient Right on the left of the image) to match 3D Slicer's defaults.
    """

    filename: str

    def __reduce__(self):
        return (self.__class__, (self.filename,))

    def __post_init__(self):
        try:
            import nibabel as nib
        except ImportError:
            raise ImportError(
                'nibabel is required to open NIfTI files. '
                'Install it with: pip install nibabel'
            )

        img = nib.load(self.filename)
        # Reorient to the closest canonical RAS orientation so that voxel axes
        # align with Right-Anterior-Superior world coordinates.  Without this,
        # volumes acquired with oblique or permuted affines display rotated
        # because the renderer assumes a diagonal affine.
        img = nib.as_closest_canonical(img)
        self._nib_header = img.header

        # np.asarray gives memory-mapped access for uncompressed .nii;
        # .nii.gz (and any reoriented image) is in RAM.
        raw = np.asarray(img.dataobj).squeeze()

        if raw.ndim < 2:
            raise ValueError(f'NIfTI volume has fewer than 2 dimensions ({raw.ndim}D)')
        if raw.ndim == 2:
            raw = raw[:, :, np.newaxis]
        elif raw.ndim > 3:
            # Flatten extra dimensions (time, channels, …) into z
            raw = raw.reshape(raw.shape[0], raw.shape[1], -1)

        self._data = raw  # shape: (X, Y, Z) in RAS+

        # Derive voxel sizes from the affine rather than header.get_zooms().
        # get_zooms() reads pixdim from the raw NIfTI header struct, which
        # reflects the *original* axis order and is not updated when
        # as_closest_canonical permutes the axes.  The affine is always
        # recomputed correctly by nibabel during reorientation.
        vox_sizes = np.sqrt((img.affine[:3, :3] ** 2).sum(axis=0))
        self._sx = float(vox_sizes[0]) if vox_sizes[0] > 0 else 1.0  # mm, X = Right
        self._sy = float(vox_sizes[1]) if vox_sizes[1] > 0 else 1.0  # mm, Y = Anterior
        self._sz = float(vox_sizes[2]) if len(vox_sizes) > 2 and vox_sizes[2] > 0 else 1.0  # mm, Z = Superior

        # NIfTI voxel sizes are in mm; EXACT expects µm for mpp (axial plane)
        self._mppx = self._sx * 1000.0
        self._mppy = self._sy * 1000.0

        nx, ny, nz = self._data.shape
        # Physical pixel dimensions for each reformat plane after aspect-ratio correction.
        # The finest in-plane voxel is the reference so neither axis loses detail.
        self._ax_dims  = self._plane_px_dims(self._sx, self._sy, nx, ny)  # axial   XY
        self._cor_dims = self._plane_px_dims(self._sx, self._sz, nx, nz)  # coronal XZ
        self._sag_dims = self._plane_px_dims(self._sy, self._sz, ny, nz)  # sagittal YZ

        # Compute robust display window from a sparse sample to avoid a full scan
        flat = self._data.ravel()
        step = max(1, len(flat) // 100_000)
        sample = flat[::step].astype(np.float32)
        sample = sample[sample > sample.min()]  # ignore absolute minimum (air/background)
        self._wmin = float(np.percentile(sample, 1))
        self._wmax = float(np.percentile(sample, 99))
        if self._wmax <= self._wmin:
            self._wmax = self._wmin + 1.0

    # ------------------------------------------------------------------
    # Plane helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _plane_px_dims(s1: float, s2: float, n1: int, n2: int) -> Tuple[int, int]:
        """Return physical (width, height) in pixels for a plane with spacings s1, s2 mm."""
        ref = min(s1, s2)
        return (max(1, round(n1 * s1 / ref)), max(1, round(n2 * s2 / ref)))

    def dimensions_for_plane(self, plane: int = PlaneType.AXIAL) -> Tuple[int, int]:
        """Physical (width, height) in pixels for the given plane."""
        return (self._ax_dims, self._cor_dims, self._sag_dims)[plane]

    def nframes_for_plane(self, plane: int = PlaneType.AXIAL) -> int:
        """Number of slices available along the normal axis of the given plane."""
        nx, ny, nz = self._data.shape
        return (nz, ny, nx)[plane]

    def frame_descriptors_for_plane(self, plane: int = PlaneType.AXIAL) -> List[str]:
        """Human-readable position label for each frame of the given plane."""
        nx, ny, nz = self._data.shape
        if plane == PlaneType.CORONAL:
            return ['y=%.2f mm' % (i * self._sy) for i in range(ny)]
        if plane == PlaneType.SAGITTAL:
            return ['x=%.2f mm' % (i * self._sx) for i in range(nx)]
        return ['z=%.2f mm' % (i * self._sz) for i in range(nz)]

    # ------------------------------------------------------------------
    # OpenSlide-compatible interface  (defaults to axial plane)
    # ------------------------------------------------------------------

    @property
    def dimensions(self) -> Tuple[int, int]:
        """(width, height) of the axial plane in physical pixels."""
        return self._ax_dims

    @property
    def level_count(self) -> int:
        return 1

    @property
    def level_dimensions(self) -> List[Tuple[int, int]]:
        return [self._ax_dims]

    @property
    def level_downsamples(self) -> List[float]:
        return [1.0]

    def get_best_level_for_downsample(self, downsample: float) -> int:
        return 0

    @property
    def properties(self) -> Dict[str, str]:
        return {
            openslide.PROPERTY_NAME_BACKGROUND_COLOR: '000000',
            openslide.PROPERTY_NAME_MPP_X: str(self._mppx),
            openslide.PROPERTY_NAME_MPP_Y: str(self._mppy),
            openslide.PROPERTY_NAME_OBJECTIVE_POWER: '1',
            openslide.PROPERTY_NAME_VENDOR: 'NIfTI',
        }

    # ------------------------------------------------------------------
    # Z-stack / frame interface  (defaults to axial plane)
    # ------------------------------------------------------------------

    @property
    def nFrames(self) -> int:
        return int(self._data.shape[2])

    @property
    def frame_type(self) -> FrameType:
        return FrameType.ZSTACK

    @property
    def frame_descriptors(self) -> List[str]:
        return self.frame_descriptors_for_plane(PlaneType.AXIAL)

    @property
    def default_frame(self) -> int:
        return self._data.shape[2] // 2

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------

    def _render_plane(self, frame: int, plane: int = PlaneType.AXIAL) -> np.ndarray:
        """Return a uint8 RGBA array at the physical pixel size for the given plane.

        Radiological convention is applied in all three planes:
          axial    – Anterior at top,  patient Right on left
          coronal  – Superior at top,  patient Right on left
          sagittal – Superior at top,  Posterior on left (view from patient's left)
        """
        nx, ny, nz = self._data.shape

        if plane == PlaneType.CORONAL:
            y = max(0, min(frame, ny - 1))
            # data[:, y, :] → (nx, nz); .T → (nz, nx) = (height, width)
            slc = self._data[:, y, :].astype(np.float32).T
            slc = slc[::-1, ::-1]   # Superior at top, Right on left
            pw, ph = self._cor_dims

        elif plane == PlaneType.SAGITTAL:
            x = max(0, min(frame, nx - 1))
            # data[x, :, :] → (ny, nz); .T → (nz, ny) = (height, width)
            slc = self._data[x, :, :].astype(np.float32).T
            slc = slc[::-1, ::-1]   # Superior at top, Anterior on left (view from patient's right)
            pw, ph = self._sag_dims

        else:  # AXIAL
            z = max(0, min(frame, nz - 1))
            # data[:, :, z] → (nx, ny); .T → (ny, nx) = (height, width)
            slc = self._data[:, :, z].astype(np.float32).T
            slc = slc[::-1, ::-1]   # Anterior at top, Right on left
            pw, ph = self._ax_dims

        slc = np.clip(
            (slc - self._wmin) / (self._wmax - self._wmin) * 255.0,
            0, 255,
        ).astype(np.uint8)
        rgba = np.stack([slc, slc, slc, np.full_like(slc, 255)], axis=-1)

        if rgba.shape[1] != pw or rgba.shape[0] != ph:
            rgba = np.array(
                Image.fromarray(rgba, 'RGBA').resize((pw, ph), Image.LANCZOS)
            )
        return rgba

    def get_thumbnail(self, size: Tuple[int, int]) -> Image.Image:
        rgba = self._render_plane(self.default_frame, PlaneType.AXIAL)
        return Image.fromarray(rgba, 'RGBA').resize(size, Image.LANCZOS)

    def read_region(
        self,
        location: Tuple[int, int],
        level: int,
        size: Tuple[int, int],
        frame: int = 0,
        plane: int = PlaneType.AXIAL,
    ) -> Image.Image:
        x, y = location
        width, height = size
        rgba_full = self._render_plane(frame, plane)
        img_h, img_w = rgba_full.shape[:2]

        canvas = np.zeros((height, width, 4), dtype=np.uint8)
        src_x1 = max(0, x)
        src_y1 = max(0, y)
        src_x2 = min(img_w, x + width)
        src_y2 = min(img_h, y + height)
        if src_x2 > src_x1 and src_y2 > src_y1:
            dst_x1 = src_x1 - x
            dst_y1 = src_y1 - y
            crop = rgba_full[src_y1:src_y2, src_x1:src_x2]
            canvas[dst_y1:dst_y1 + crop.shape[0], dst_x1:dst_x1 + crop.shape[1]] = crop

        return Image.fromarray(canvas, 'RGBA')
