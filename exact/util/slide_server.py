from collections import OrderedDict
from io import BytesIO
from typing import Tuple
import openslide
from openslide import OpenSlide, OpenSlideError, open_slide
from openslide.deepzoom import DeepZoomGenerator
import os
from optparse import OptionParser
from threading import Lock
from PIL import Image

SLIDE_CACHE_SIZE = 10
DEEPZOOM_FORMAT = 'jpeg'
DEEPZOOM_TILE_SIZE = 256
DEEPZOOM_OVERLAP = 1
DEEPZOOM_LIMIT_BOUNDS = True
DEEPZOOM_TILE_QUALITY = 75


import openslide
from PIL import Image
import numpy as np
from util.cellvizio import ReadableCellVizioMKTDataset
from openslide import OpenSlideError
import tifffile
from util.tiffzstack import OMETiffSlide, OMETiffZStack
from util.slideio import SlideIOSlide
from util.enums import FrameType


class zDeepZoomGenerator(DeepZoomGenerator):
    def get_tile(self, level, address, frame=0):
        """Return an RGB PIL.Image for a tile.

        level:     the Deep Zoom level.
        address:   the address of the tile within the level as a (col, row)
                   tuple."""

        # Read tile
        args, z_size = self._get_tile_info(level, address)
        tile = self._osr.read_region(*args, frame=frame)
        profile = tile.info.get('icc_profile')

        # Apply on solid background
        bg = Image.new('RGB', tile.size, self._bg_color)
        tile = Image.composite(tile, bg, tile)

        # Scale to the correct size
        if tile.size != z_size:
            # Image.Resampling added in Pillow 9.1.0
            # Image.LANCZOS removed in Pillow 10
            tile.thumbnail(z_size, getattr(Image, 'Resampling', Image).LANCZOS)

        # Reference ICC profile
        if profile is not None:
            tile.info['icc_profile'] = profile

        return tile

class OpenSlideWrapper(openslide.OpenSlide):
    """
        Wraps an openslide.OpenSlide object. The rationale here is that OpenSlide.read_region does not support z Stacks / frames as arguments, hence we have to encapsulate it

    """

    @property 
    def nFrames(self):
        return 1

    @property
    def frame_descriptors(self) -> list[str]:
        """ returns a list of strings, used as descriptor for each frame
        """
        return ['']

    @property
    def frame_type(self):
        return FrameType.UNDEFINED

    def read_region(self, location, level, size, frame=0):
        return openslide.OpenSlide.read_region(self, location, level, size)


    def __init__(self, slide_path):
        super().__init__(slide_path)
        self.slide_path = slide_path  # Store path for later reconstruction

    def __reduce__(self):
        # Define how to pickle the object
        return (self.__class__, (self.slide_path,))


class OMETiffSlideWrapper(OMETiffSlide, openslide.OpenSlide):
    
    @property 
    def nFrames(self):
        return 1

    @property
    def frame_descriptors(self) -> list[str]:
        """ returns a list of strings, used as descriptor for each frame
        """
        return ['']

    @property
    def frame_type(self):
        return FrameType.UNDEFINED
    
    def read_region(self, location, level, size, frame=0):
        return super().read_region(location, level, size)

    def __init__(self, slide_path):
        super().__init__(slide_path)
        self.slide_path = slide_path  # Store path for later reconstruction

    def __reduce__(self):
        # Define how to pickle the object
        return (self.__class__, (self.slide_path,))



class ImageSlideWrapper(openslide.ImageSlide):
    """
        Wraps an openslide.ImageSlide object. The rationale here is that OpenSlide.read_region does not support z Stacks / frames as arguments, hence we have to encapsulate it

    """
    def read_region(self, location, level, size, zLevel=0, frame=0):
        return openslide.ImageSlide.read_region(self, location, level, size)

    def __init__(self, slide_path):
        super().__init__(slide_path)
        self.slide_path = slide_path  # Store path for later reconstruction

    def __reduce__(self):
        # Define how to pickle the object
        return (self.__class__, (self.slide_path,))

class ImageSlide3D(openslide.ImageSlide):

    def __reduce__(self):
        # Define how to pickle the object
        return (self.__class__, (self.slide_path,))

    @property 
    def nFrames(self):
        return self.numberOfLayers

    @property
    def frame_descriptors(self) -> list[str]:
        """ returns a list of strings, used as descriptor for each frame
        """
        return [str(x) for x in range(self.nFrames)]

    @property
    def default_frame(self) -> list[str]:
        return 0

    @property
    def frame_type(self):
        return FrameType.ZSTACK

    def __init__(self, file):
        """Open an image file.

        file can be a filename or a PIL.Image."""

        self.slide_path = file
        openslide.ImageSlide.__init__(self, file)

        try:
            self.numberOfLayers = self._image.n_frames 
        except:
            self.numberOfLayers = 1
        

    def read_region(self, location, level, size, frame=0):
        """Return a PIL.Image containing the contents of the region.

        location: (x, y) tuple giving the top left pixel in the level 0
                  reference frame.
        level:    the level number.
        size:     (width, height) tuple giving the region size."""

        if level != 0:
            raise OpenSlideError("Invalid level")
        if ['fail' for s in size if s < 0]:
            raise OpenSlideError("Size %s must be non-negative" % (size,))
        # for non-pyramidal tiff files we can only read frame 0 
        if frame >= self.numberOfLayers:
            frame = self.numberOfLayers - 1 
        # Any corner of the requested region may be outside the bounds of
        # the image.  Create a transparent tile of the correct size and
        # paste the valid part of the region into the correct location.
        image_topleft = [max(0, min(l, limit - 1))
                    for l, limit in zip(location, self._image.size)]
        image_bottomright = [max(0, min(l + s - 1, limit - 1))
                    for l, s, limit in zip(location, size, self._image.size)]
        tile = Image.new("RGBA", size, (0,) * 4)

        if not ['fail' for tl, br in zip(image_topleft, image_bottomright)
                if br - tl < 0]:  # "< 0" not a typo
            # Crop size is greater than zero in both dimensions.
            # PIL thinks the bottom right is the first *excluded* pixel
            self._image.seek(frame)
            crop = self._image.crop(image_topleft +
                    [d + 1 for d in image_bottomright])
            tile_offset = tuple(il - l for il, l in
                    zip(image_topleft, location))
            tile.paste(crop, tile_offset)
        return tile  
    

import cv2
import numpy as np
from PIL import Image
import openslide
from openslide import OpenSlideError

class MovieWrapperCV2(openslide.ImageSlide):
    def __init__(self, file_path):
        self.slide_path = file_path
        
        # Open video to get metadata
        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            raise OpenSlideError(f"Could not open video file: {file_path}")
        
        # Read properties
        self._width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.numberOfLayers = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = cap.get(cv2.CAP_PROP_FPS)
        
        # Clean up initial capture
        cap.release()
        
        # Mimic OpenSlide properties
        self._dimensions = (self._width, self._height)
        
    def __reduce__(self):
        return (self.__class__, (self.slide_path,))

    @property
    def dimensions(self):
        return self._dimensions

    @property
    def frame_descriptors(self) -> list[str]:
        """ returns a list of strings, used as descriptor for each frame
        """
        return ['%.2f' % (x/self.fps) for x in range(self.nFrames)]

    def get_thumbnail(self, size):
        return self.read_region((0,0),0, self.dimensions).resize(size)

    @property
    def frame_type(self):
        return FrameType.TIMESERIES

    @property
    def default_frame(self) -> list[str]:
        return 0

    @property 
    def nFrames(self):
        return self.numberOfLayers

    def read_region(self, location, level, size, frame=0):
        """
        Reads a region from a specific video frame.
        """
        if level != 0:
            raise OpenSlideError("Only level 0 is supported for video files.")
        
        if any(s < 0 for s in size):
            raise OpenSlideError(f"Size {size} must be non-negative")

        # Clamp frame index
        frame = max(0, min(frame, self.numberOfLayers - 1))

        # Re-open capture for the read (or use a pooled capture for performance)
        cap = cv2.VideoCapture(self.slide_path)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
        success, img = cap.read()
        cap.release()

        if not success:
            # Return a transparent tile if frame read fails
            return Image.new("RGBA", size, (0, 0, 0, 0))

        # Convert BGR (OpenCV) to RGBA (OpenSlide/PIL)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
        
        # Calculate boundaries (handling out-of-bounds requests)
        x, y = location
        w, h = size
        
        # Create the transparent canvas
        tile = Image.new("RGBA", size, (0, 0, 0, 0))
        
        # Calculate crop boundaries within the source image
        img_h, img_w = img_rgb.shape[:2]
        
        # Source coordinates
        src_x1 = max(0, min(x, img_w))
        src_y1 = max(0, min(y, img_h))
        src_x2 = max(0, min(x + w, img_w))
        src_y2 = max(0, min(y + h, img_h))
        
        # Destination coordinates (where to paste on the tile)
        dst_x1 = max(0, -x) if x < 0 else 0
        dst_y1 = max(0, -y) if y < 0 else 0
        
        # Extract the crop using numpy slicing
        crop_data = img_rgb[src_y1:src_y2, src_x1:src_x2]
        
        if crop_data.size > 0:
            crop_img = Image.fromarray(crop_data)
            tile.paste(crop_img, (dst_x1, dst_y1))
            
        return tile

    # Boilerplate compatibility properties
    @property
    def level_dimensions(self):
        return (self.dimensions,)

    @property
    def level_count(self):
        return 1 
    

vendor_handlers = {'aperio': OpenSlideWrapper,
                    'dicom' : OpenSlideWrapper,
                    'mirax' : OpenSlideWrapper,
                    'philips' : OpenSlideWrapper,
                    'sakura' : OpenSlideWrapper,
                    'synthetic' : OpenSlideWrapper,
                    'trestle' :OpenSlideWrapper,
                    'ventana' : OpenSlideWrapper,
                    'leica' : OpenSlideWrapper,
                    'hamamatsu' : OpenSlideWrapper,
                    'generic-tiff' : OpenSlideWrapper}



class GenericTiffHandler:
    """
       A generic TIFF handler that uses OpenSlide whereever possible and needed but allows for the use of more sophisticated drop-ins
    """    
    def __reduce__(self):
        # Define how to pickle the object
        return (self.__class__, (self.slide_path,))

    def __new__(self, file):
        
        # Check if it's an OME TIFF
        f = tifffile.TiffFile(file)
        if f.ome_metadata:
            if len(f.series) > 1:
                # We assume Zstacks are stored as multiple series
                return OMETiffZStack(file)
            else:
                return OMETiffSlideWrapper(file)

        # else let OpenSlide handle it for us.
        vendor = openslide.lowlevel.detect_vendor(file)
        if vendor in vendor_handlers:
            return OpenSlideWrapper(file)
        else:
            return ImageSlide3D(file)
            


class TiffHandler(openslide.OpenSlide):

    def __new__(self, file):
        vendor = openslide.lowlevel.detect_vendor(file)
        if vendor in vendor_handlers:
            return GenericTiffHandler(file)            
        else:
            return ImageSlide3D(file)

class FileType:
    magic_number = b'\x00\x00\x00\x00' # primary critereon to identify file
    extensions = [] # List of known file extensions as secondary critereon
    handler = openslide.open_slide # handler returning an OpenSlide-compatible object
    magic_number_offset = 0

class BigTiffFileType(FileType):
    magic_number = b'\x49\x49\x2b\x00'
    extensions = ['tiff', 'tif', 'svs', 'btf']
    handler = GenericTiffHandler

class NormalTiffFileType(FileType):
    magic_number = b'\x49\x49\x2a\x00' 
    extensions = ['tiff', 'tif']
    handler = TiffHandler

class HamamatsuTiffFileType(FileType):
    magic_number = b'\x49\x49\x2a\x00' 
    extensions = ['ndpi']
    handler = OpenSlideWrapper

class OlympusVSIFileType(FileType):
    magic_number = b'\x49\x49\x2a\x00' 
    extensions = ['vsi']
    handler = SlideIOSlide

class JPEGJFIFFileType(FileType):
    magic_number = b'\xff\xd8\xff\xe0'
    extensions = ['jpg','jpeg']
    handler = ImageSlideWrapper

class JPEGEXIFFileType(FileType):
    magic_number = b'\xff\xd8\xff\xe1'
    extensions = ['jpg','jpeg']
    handler = ImageSlideWrapper

class MP4MovieFileType(FileType):
    extensions = ['mp4']
    magic_number = b'\x66\x74\x79\x70'
    magic_number_offset = 4
    handler = MovieWrapperCV2

class PNGFileType(FileType):
    magic_number = b'\x89\x50\x4e\x47'
    extensions = ['png']
    handler = ImageSlideWrapper

class PhilipsISyntaxFileType(FileType):
    magic_number = b'\x3c\x44\x61\x74'
    extensions = 'isyntax'

class MiraxFileType(FileType):
    magic_number = b'\xff\xd8\xff\xe0'
    extensions = 'mrxs'
    handler = OpenSlideWrapper

class DicomFileType(FileType):
    magic_number = b'DICM'
    extensions = 'dcm'
    magic_number_offset=128
    handler = SlideIOSlide

class ZeissCZIFile(FileType):
    magic_number = b'\x5a\x49\x53\x52'
    extensions = 'czi'
    magic_number_offset = 0
    handler = SlideIOSlide

class MKTFileType(FileType):
    magic_number = b'\x0a\x3c\x43\x53'
    extensions = 'mkt'
    handler = ReadableCellVizioMKTDataset



SupportedFileTypes = [MKTFileType, MP4MovieFileType, DicomFileType, MiraxFileType, PhilipsISyntaxFileType, PNGFileType, JPEGEXIFFileType, JPEGJFIFFileType, OlympusVSIFileType, NormalTiffFileType, BigTiffFileType, ZeissCZIFile]



class PILBytesIO(BytesIO):
    def fileno(self):
        '''Classic PIL doesn't understand io.UnsupportedOperation.'''
        # TODO: Check this exception out!!!
        raise AttributeError('Not supported')


def getSlideHandler(path):
        # Determine format of slide to see how to handle it.
        f = open(path,'rb')
        magic_number = {0: f.read(4)}
        candidates=[]
        print('Magic number:',[hex(x) for x in magic_number[0]])
        for ftype in SupportedFileTypes:
            mnum = magic_number
            if ftype.magic_number_offset not in magic_number:
                f.seek(ftype.magic_number_offset)
                magic_number[ftype.magic_number_offset] = f.read(4)
                print('At offset: ',ftype.magic_number_offset,'it is', [hex(x) for x in magic_number[ftype.magic_number_offset]])
            if (magic_number[ftype.magic_number_offset]==ftype.magic_number):
                candidates.append(ftype)
                print('Match for file type:', ftype)

        if (len(candidates)>0):
            for ftype in candidates:
                if (path.split('.')[-1].lower() in ftype.extensions):
                    filehandler = ftype.handler
                    #print('Found file handler: ',filehandler)
                    try:
                        return  filehandler(path)        
                    except Exception as e:
                        print('Unable to open file handler. :-( ',e)
                        pass
        
        # as last resort, try openSlide:
        try:
            return OpenSlideWrapper(path)
        except:
            print('Found no file handler',path)

        return None
                    

class SlideCache(object):
    def __init__(self, cache_size):
        self.cache_size = cache_size
        self._lock = Lock()
        self._cache = OrderedDict()

    def get(self, path):
        with self._lock:
            if path in self._cache:
                # Move to end of LRU
                slide = self._cache.pop(path)
                self._cache[path] = slide
                return slide

        osr = getSlideHandler(path)
        slide = zDeepZoomGenerator(osr)
        try:
            mpp_x = osr.properties[openslide.PROPERTY_NAME_MPP_X]
            mpp_y = osr.properties[openslide.PROPERTY_NAME_MPP_Y]
            slide.mpp = (float(mpp_x) + float(mpp_y)) / 2
        except (KeyError, ValueError):
            slide.mpp = 0

        with self._lock:
            if path not in self._cache:
                if len(self._cache) == self.cache_size:
                    self._cache.popitem(last=False)
                self._cache[path] = slide
#        print('Added to cache')
        return slide

class SlideFile(object):
    def __init__(self, relpath):
        self.name = os.path.basename(relpath)
        self.url_path = relpath