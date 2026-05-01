from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image

from util.enums import FrameType
import openslide


@dataclass
class NIfTISlide:
    """OpenSlide-compatible reader for NIfTI (.nii, .nii.gz) volumetric images.

    Each z-slice is presented as a Z-stack frame. Intensity is auto-windowed
    using the 1st–99th percentile of a sparse sample for display.
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
        self._nib_header = img.header

        # np.asarray gives memory-mapped access for uncompressed .nii;
        # .nii.gz is decompressed into RAM by nibabel.
        raw = np.asarray(img.dataobj).squeeze()

        if raw.ndim < 2:
            raise ValueError(f'NIfTI volume has fewer than 2 dimensions ({raw.ndim}D)')
        if raw.ndim == 2:
            raw = raw[:, :, np.newaxis]
        elif raw.ndim > 3:
            # Flatten extra dimensions (time, channels, …) into z
            raw = raw.reshape(raw.shape[0], raw.shape[1], -1)

        self._data = raw  # shape: (X, Y, Z)

        zooms = self._nib_header.get_zooms()
        # NIfTI zooms are in mm; EXACT expects µm for mpp
        self._mppx = float(zooms[0]) * 1000.0 if len(zooms) > 0 else 0.0
        self._mppy = float(zooms[1]) * 1000.0 if len(zooms) > 1 else 0.0
        self._mppz = float(zooms[2]) if len(zooms) > 2 else 1.0  # mm, for frame labels

        # Compute robust display window from a sparse sample to avoid a full scan
        flat = self._data.ravel()
        step = max(1, len(flat) // 100_000)
        sample = flat[::step].astype(np.float32)
        self._wmin = float(np.percentile(sample, 1))
        self._wmax = float(np.percentile(sample, 99))
        if self._wmax <= self._wmin:
            self._wmax = self._wmin + 1.0

    # ------------------------------------------------------------------
    # OpenSlide-compatible interface
    # ------------------------------------------------------------------

    @property
    def dimensions(self) -> Tuple[int, int]:
        """(width, height) of one axial slice."""
        return (int(self._data.shape[0]), int(self._data.shape[1]))

    @property
    def level_count(self) -> int:
        return 1

    @property
    def level_dimensions(self) -> List[Tuple[int, int]]:
        return [self.dimensions]

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
    # Z-stack / frame interface
    # ------------------------------------------------------------------

    @property
    def nFrames(self) -> int:
        return int(self._data.shape[2])

    @property
    def frame_type(self) -> FrameType:
        return FrameType.ZSTACK

    @property
    def frame_descriptors(self) -> List[str]:
        return ['z=%.2f mm' % (i * self._mppz) for i in range(self.nFrames)]

    @property
    def default_frame(self) -> int:
        return self.nFrames // 2

    # ------------------------------------------------------------------
    # Region reading
    # ------------------------------------------------------------------

    def _render_slice(self, z_idx: int) -> np.ndarray:
        """Return a uint8 RGBA array (height, width, 4) for slice z_idx."""
        z_idx = max(0, min(z_idx, self.nFrames - 1))
        # _data shape is (X, Y, Z); transpose the XY plane to (Y, X) = (height, width)
        slc = self._data[:, :, z_idx].astype(np.float32).T
        slc = np.clip(
            (slc - self._wmin) / (self._wmax - self._wmin) * 255.0,
            0, 255,
        ).astype(np.uint8)
        return np.stack([slc, slc, slc, np.full_like(slc, 255)], axis=-1)

    def get_thumbnail(self, size: Tuple[int, int]) -> Image.Image:
        rgba = self._render_slice(self.default_frame)
        return Image.fromarray(rgba, 'RGBA').resize(size, Image.LANCZOS)

    def read_region(
        self,
        location: Tuple[int, int],
        level: int,
        size: Tuple[int, int],
        frame: int = 0,
    ) -> Image.Image:
        x, y = location
        width, height = size
        rgba_full = self._render_slice(frame)
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
