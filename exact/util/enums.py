class FrameType:
    ZSTACK = 0
    TIMESERIES = 1
    UNDEFINED = 255


class PlaneType:
    AXIAL    = 0  # XY plane, sliced at z  →  frame = z index
    CORONAL  = 1  # XZ plane, sliced at y  →  frame = y index
    SAGITTAL = 2  # YZ plane, sliced at x  →  frame = x index

