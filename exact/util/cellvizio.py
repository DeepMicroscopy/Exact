"""
        This is SlideRunner - An Open Source Annotation Tool
        for Digital Histology Slides.
         Marc Aubreville, Pattern Recognition Lab,
         Friedrich-Alexander University Erlangen-Nuremberg
         marc.aubreville@fau.de
        If you use this software in research, please citer our paper:
        M. Aubreville, C. Bertram, R. Klopfleisch and A. Maier:
        SlideRunner - A Tool for Massive Cell Annotations in Whole Slide Images.
        In: Bildverarbeitung für die Medizin 2018.
        Springer Vieweg, Berlin, Heidelberg, 2018. pp. 309-314.
   This file: Support for CellVizio MKT files.
"""

import numpy as np
from PIL import Image
import struct
import openslide

from util.enums import FrameType


_CHUNK_HEADER_SIZE = 16
_CSTA_MAGIC = b'\n<CSTA'


class fileinfo:
    offset = 16            # 16-byte CSTA header before first frame data
    gapBetweenImages = 32  # CEND (16) + CSTA (16) between consecutive frames
    size = 0
    width = 0
    height = 0
    nImages = 0


class circularMask:
    mask = 0
    def __init__(self, w, h, r):
        self.x, self.y = np.ogrid[-int(h/2):np.ceil(h/2), -int(w/2):np.ceil(w/2)]
        self.mask = self.x*self.x + self.y*self.y <= int(r/2)*int(r/2)


def _parse_type5_body(body: bytes) -> tuple[list[tuple[int, int, int]], dict[str, str]]:
    """Parse a type-5 MKT chunk body.

    Returns (index_entries, kv) where index_entries is a list of
    (chunk_type, file_offset, data_size) and kv is all key=value metadata.
    """
    n = struct.unpack('<I', body[0:4])[0]
    entries = [
        struct.unpack('<III', body[4 + i*12 : 4 + (i+1)*12])
        for i in range(n)
    ]
    kv: dict[str, str] = {}
    for line in body[4 + n*12:].split(b'\n'):
        line = line.strip(b'\x00').strip()
        if b'=' in line:
            k, _, v = line.partition(b'=')
            kv[k.decode('ascii')] = v.decode('ascii', errors='replace')
    return entries, kv


def _load_chunk_index(filename: str) -> tuple[list[tuple[int, int, int]], dict[str, str]]:
    """Locate and parse the type-5 index/metadata chunk in an MKT file.

    Scans the last 64 KB (sufficient for all trailing metadata chunks) to find
    the type-5 chunk, which always appears near the end of the file.
    Returns (index_entries, kv_dict).
    """
    with open(filename, 'rb') as f:
        f.seek(0, 2)
        file_size = f.tell()
        scan_size = min(65536, file_size)
        f.seek(file_size - scan_size)
        tail = f.read()

    pos = 0
    while pos < len(tail):
        idx = tail.find(_CSTA_MAGIC, pos)
        if idx == -1:
            break
        hdr = tail[idx : idx + _CHUNK_HEADER_SIZE]
        if len(hdr) < _CHUNK_HEADER_SIZE:
            break
        chunk_type = struct.unpack('>H', hdr[8:10])[0]
        chunk_size = struct.unpack('>I', hdr[10:14])[0]
        if chunk_type == 5:
            body = tail[idx + _CHUNK_HEADER_SIZE : idx + _CHUNK_HEADER_SIZE + chunk_size]
            return _parse_type5_body(body)
        pos = idx + 1

    return [], {}


class ReadableCellVizioMKTDataset():

    def __init__(self, filename):
        self.fileName = filename
        self.fi = fileinfo()

        # Read image data size from the first chunk header (bytes 10–13, big-endian uint32)
        with open(filename, 'rb') as f:
            f.seek(10)
            self.fi.size = struct.unpack('>I', f.read(4))[0]

        # Parse the type-5 chunk for the chunk index and all key=value metadata
        chunk_index, self._kv = _load_chunk_index(filename)

        # Collect data offsets for every type-2 (image frame) chunk
        self._frame_offsets = [
            entry[1] + _CHUNK_HEADER_SIZE
            for entry in chunk_index if entry[0] == 2
        ]
        self.numberOfFrames = len(self._frame_offsets)
        self.fi.nImages = self.numberOfFrames

        meta = self._kv
        self.fi.width  = int(meta.get('width', 0))
        self.fi.height = int(meta.get('height', 0))
        self.fps = float(meta.get('framerate', 0))

        self.geometry_imsize   = [self.fi.height, self.fi.width]
        self.imsize            = [self.fi.height, self.fi.width]
        self.geometry_tilesize = [(self.fi.height, self.fi.width)]
        self.geometry_rows     = [1]
        self.geometry_columns  = [1]
        self.levels            = [1]
        self.channels          = 1

        self.fovx  = float(meta.get('fovx', 250))
        self.fovy  = float(meta.get('fovy', 250))
        print(f"fovx: {self.fovx}, fovy: {self.fovy}")
        self.mpp_x = self.fovx / self.fi.width
        self.mpp_y = self.fovy / self.fi.height

        self.circMask = circularMask(self.fi.width, self.fi.height, self.fi.width - 2).mask

        self.properties = {
            openslide.PROPERTY_NAME_BACKGROUND_COLOR: '000000',
            openslide.PROPERTY_NAME_MPP_X: self.mpp_x,
            openslide.PROPERTY_NAME_MPP_Y: self.mpp_y,
            openslide.PROPERTY_NAME_OBJECTIVE_POWER: 20,
            openslide.PROPERTY_NAME_VENDOR: 'MKT',
        }

    def getMetaInfo(self) -> dict[str, str]:
        """Return all key=value metadata from the type-5 chunk."""
        return self._kv

    def getMostRelevantMetaInfo(self) -> dict[str, str]:
        """Return metadata values for all labeled fields (keys defined in meta_data_dict)."""
        result = {k: self._kv[k] for k in self.meta_data_dict if k in self._kv}
        if self.fps > 0:
            result['duration_seconds'] = str(self.numberOfFrames / self.fps)
        return result

    @property
    def meta_data(self) -> dict:
        return self.getMostRelevantMetaInfo()

    @property
    def meta_data_dict(self) -> dict:
        labels = {
            # Patient / recording
            'patient_id':              'Patient ID',
            'biopsy':                  'Biopsy taken',
            'duration_seconds':        'Duration (s)',
            'framerate':               'Frame rate (fps)',
            'mosaicing_enabled':       'Mosaicing enabled',
            'utc_offset_seconds':      'UTC offset (s)',
            # Image geometry
            'width':                   'Image width (px)',
            'height':                  'Image height (px)',
            'fovx':                    'FOV x (µm)',
            'fovy':                    'FOV y (µm)',
            'pfovx':                   'Probe FOV x (µm)',
            'pfovy':                   'Probe FOV y (µm)',
            'bbox_min_x':              'Mosaic bbox min x (px)',
            'bbox_min_y':              'Mosaic bbox min y (px)',
            'bbox_max_x':              'Mosaic bbox max x (px)',
            'bbox_max_y':              'Mosaic bbox max y (px)',
            # Display
            'pal_cropMin':             'Display window min',
            'pal_cropMax':             'Display window max',
            'mask_level':              'Mask level',
            'compression_type':        'Compression',
            # Laser / acquisition
            'eocu_mode':               'Imaging mode',
            'eocu_laser_wavelength':   'Laser wavelength (nm)',
            'eocu_lpwr':               'Laser power (%)',
            'eocu_serial_number':      'EOCU serial number',
            'eocu_uid':                'EOCU UID',
            # Probe
            'proflex_type':            'Probe type',
            'proflex_uid':             'Probe UID',
            'proflex_diameter':        'Probe diameter (mm)',
            'proflex_length':          'Probe length (m)',
            'proflex_lateral_res':     'Lateral resolution (µm)',
            'proflex_axial_res':       'Axial resolution (µm)',
            'proflex_working_dist':    'Working distance (µm)',
            'proflex_sensitivity':     'Probe sensitivity',
            # Software
            'mzversion_str':           'Software version',
        }
        # Only return labels for fields present in this file
        return {k: v for k, v in labels.items() if k in self._kv or k == 'duration_seconds'}

    @property
    def seriesInstanceUID(self) -> str:
        return ''

    @property
    def level_downsamples(self):
        return [1]

    @property
    def level_dimensions(self):
        return [self.geometry_imsize]

    @property
    def nFrames(self):
        return self.numberOfFrames

    @property
    def frame_descriptors(self) -> list[str]:
        return ['%.2f s (%d)' % (float(frame_id) / float(self.fps), frame_id)
                for frame_id in range(self.nFrames)]

    @property
    def nLayers(self):
        return 1

    @property
    def layer_descriptors(self) -> list[str]:
        return ['']

    @property
    def frame_type(self):
        return FrameType.TIMESERIES

    def get_thumbnail(self, size):
        return self.read_region((0, 0), 0, self.dimensions).resize(size)

    def readImage(self, position=0):
        seekpos = self._frame_offsets[position]
        image = np.fromfile(self.fileName, offset=seekpos, dtype=np.int16,
                            count=int(self.fi.size / 2))

        if image.size > 0:
            image = np.clip(image, 0, np.max(image))

        if image.shape[0] != self.fi.height * self.fi.width:
            image = np.zeros((self.fi.height, self.fi.width))

        return np.reshape(image, (self.fi.height, self.fi.width))

    def scaleImageUINT8(self, image, mask=None):
        if mask is None:
            mask = self.circMask

        maskedImage = image[mask]
        cmin, cmax = np.percentile(maskedImage, 0.5), np.percentile(maskedImage, 99.5)
        if cmax > 5000:
            cmax = 5000
        dyn = cmax - cmin

        compr = 255 / dyn
        image = (image - cmin) * compr
        return np.uint8(np.clip(np.round(image), 0, 255))

    def readImageUINT8(self, position=0):
        return self.scaleImageUINT8(self.readImage(position))

    def read_region(self, location: tuple, level: int, size: tuple, frame: int = 0):
        img = np.zeros((size[1], size[0], 4), np.uint8)
        img[:, :, 3] = 255
        offset = [0, 0]
        if location[1] < 0:
            offset[0] = -location[1]
            location = (location[0], 0)
        if location[0] < 0:
            offset[1] = -location[0]
            location = (0, location[1])

        pixel_array = self.readImageUINT8(position=frame)
        imgcut = pixel_array[
            location[1] : location[1] + size[1] - offset[0],
            location[0] : location[0] + size[0] - offset[1],
        ]
        imgcut = np.uint8(np.clip(np.float32(imgcut), 0, 255))

        for k in range(3):
            img[offset[0] : imgcut.shape[0] + offset[0],
                offset[1] : offset[1] + imgcut.shape[1], k] = imgcut
        return Image.fromarray(img)

    @property
    def dimensions(self):
        return self.level_dimensions[0]

    def get_best_level_for_downsample(self, downsample):
        return np.argmin(np.abs(np.asarray(self.level_downsamples) - downsample))

    @property
    def level_count(self):
        return len(self.levels)

    def imagePos_to_id(self, imagePos: tuple, level: int):
        id_x, id_y = imagePos
        if id_y >= self.geometry_rows[level]:
            id_x = self.geometry_columns[level]
        if id_x >= self.geometry_columns[level]:
            id_y = self.geometry_rows[level]
        return id_x + (id_y * self.geometry_columns[level])

    def get_id(self, pixelX: int, pixelY: int, level: int):
        id_x = round(-0.5 + (pixelX / self.geometry_tilesize[level][1]))
        id_y = round(-0.5 + (pixelY / self.geometry_tilesize[level][0]))
        return ((id_x, id_y),
                pixelX - (id_x * self.geometry_tilesize[level][0]),
                pixelY - (id_y * self.geometry_tilesize[level][1]))
