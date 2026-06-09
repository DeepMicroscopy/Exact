from collections import defaultdict
from pathlib import Path


def split_dicom_by_series(folder_path: Path) -> dict:
    """Return {series_uid: [Path, ...]} grouping for all DCM files under folder_path."""
    import pydicom

    series: dict = defaultdict(list)
    for dcm_path in sorted(folder_path.rglob('*')):
        if dcm_path.suffix.lower() != '.dcm':
            continue
        try:
            ds = pydicom.dcmread(str(dcm_path), stop_before_pixels=True)
            uid = str(getattr(ds, 'SeriesInstanceUID', 'unknown'))
            series[uid].append(dcm_path)
        except Exception:
            pass
    return dict(series)


def series_display_name(files: list) -> str:
    """Derive a human-readable name for a DICOM series from the first file's tags."""
    if not files:
        return 'dicom_series'
    try:
        import pydicom
        ds = pydicom.dcmread(str(files[0]), stop_before_pixels=True)
        parts = []
        for tag in ('Modality', 'SeriesDescription', 'SeriesNumber'):
            val = getattr(ds, tag, None)
            if val is not None:
                parts.append(str(val).strip())
        if parts:
            return '_'.join(parts)
    except Exception:
        pass
    return 'dicom_series'
