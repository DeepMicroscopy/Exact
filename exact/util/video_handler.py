"""
Scripts for MP4 files's support

"""
import threading
from collections import OrderedDict

import openslide
from openslide import OpenSlideError
import numpy as np
import cv2
from PIL import Image
try :
    from util.enums import FrameType
except ImportError:
    from enums import FrameType


class ReadableMP4Dataset(openslide.ImageSlide):
    def __init__(self, filename, cache_size=32, max_cache_bytes=None):
        self.slide_path = filename

        self._cap = None
        self._cap_lock = threading.RLock()  
        self._frame_cache = OrderedDict()
        self._cache_size = cache_size

        self._max_cache_bytes = max_cache_bytes # optional based on memory
        self._cache_bytes = 0

        cap = cv2.VideoCapture(filename)
        if not cap.isOpened():
            raise OpenSlideError(f"Could not open video file: {filename}")
        # Get video properties
        self._width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.numberOfLayers = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))    # total number of frames
        self.fps = cap.get(cv2.CAP_PROP_FPS)

        cap.release()

        self._dimensions = (self._width, self._height)
    
    def __reduce__(self):
        return (self.__class__, (self.slide_path,))
    
    def close(self):
        with self._cap_lock:
            if self._cap is not None:
                self._cap.release()
                self._cap = None

            self._frame_cache.clear()
            self._cache_bytes = 0 
    
    def __del__(self):
        self.close()

    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        self.close()

    @property
    def properties(self):
        return {
            openslide.PROPERTY_NAME_BACKGROUND_COLOR: '000000',
            openslide.PROPERTY_NAME_MPP_X: 0,
            openslide.PROPERTY_NAME_MPP_Y: 0,
            openslide.PROPERTY_NAME_OBJECTIVE_POWER: 1,
            openslide.PROPERTY_NAME_VENDOR: 'MP4'
        }


    @property
    def dimensions(self):
        return self._dimensions

    @property
    def frame_descriptors(self) -> list[str]:
        """ returns a list of strings, used as descriptor for each frame
        """
        return ['%.2f' % (x/self.fps) for x in range(self.nFrames)]

    @property
    def frame_type(self):
        return FrameType.TIMESERIES

    @property
    def default_frame(self) -> list[str]:
        return 0

    @property 
    def nFrames(self):
        return self.numberOfLayers
    
    @property
    def level_dimensions(self):
        return (self.dimensions,)

    @property
    def level_count(self):
        return 1 

    def _get_capture(self):
        if self._cap is None or not self._cap.isOpened():
            self._cap = cv2.VideoCapture(self.slide_path)
        return self._cap
    
    def _frame_num_bytes(self, frame_arr: np.ndarray) -> int:
        """
        
        Calculate the number of bytes used by a frame array.
        :param frame_arr: Description
        """
        try:
            return int(frame_arr.nbytes)
        except Exception:
            return 0
    
    def _evict_if_needed(self):
        """
        Evict frames by LRU
        """
        
        # Evict frames if exceeding max frame count
        while self._cache_size is not None and len(self._frame_cache) > self._cache_size:
            old_idx, old_frame = self._frame_cache.popitem(last=False)
            self._cache_bytes -= self._frame_num_bytes(old_frame)
        # Evict based on byte size
        if self._max_cache_bytes is not None:
            while self._cache_bytes > self._max_cache_bytes and len(self._frame_cache) > 0:
                old_idx, old_frame = self._frame_cache.popitem(last=False)
                self._cache_bytes -= self._frame_num_bytes(old_frame)

    def _read_frame(self, frame_idx: int):
        """
        Before reading the frame, check the cache first with thread safety. 
        Followed by LRU cache eviction policy.
        
        :param frame_idx: 
        """
        with self._cap_lock:
            cached = self._frame_cache.get(frame_idx)
            if cached is not None:
                self._frame_cache.move_to_end(frame_idx)
                return cached
            
            cap = self._get_capture()
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            success, img = cap.read()
            if not success:
                return None
            # Convert BGR to RGBA
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
            self._frame_cache[frame_idx] = img_rgb
            self._frame_cache.move_to_end(frame_idx, last=True)
            self._cache_bytes += self._frame_num_bytes(img_rgb)
            
            self._evict_if_needed()
            return img_rgb


    def get_thumbnail(self, size):
        return self.read_region((0,0),0, self.dimensions).resize(size)
    
    def read_region(self, location, level, size, frame=0):
        
        """
        Reads a region from a specific video frame. 
        Return a PIL.Image containing the contents of the region. 
        Reference: https://github.com/DeepMicroscopy/Exact/commit/4d52b614fa41328bf08367d99e088c1e838fb05a

        
        location: (x, y) tuple giving the top left pixel in the level 0
                  reference frame.
        level:    the level number.
        size:     (width, height) tuple giving the region size.
        frame:    the frame index to read from the video.

        """
        if level != 0:
            raise OpenSlideError("Only level 0 is supported for video files.")
        
        if any(s < 0 for s in size):
            raise OpenSlideError(f"Size {size} must be non-negative")

        # Clamp frame index
        frame = max(0, min(frame, self.numberOfLayers - 1))
        img_rgb = self._read_frame(frame)
        if img_rgb is None:
            # Return a transparent tile if frame read fails
            return Image.new("RGBA", size, (0, 0, 0, 0))
        
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

    def get_duration(self):
        """Get the length of the video in seconds."""
        return self.numberOfLayers / self.fps if self.fps > 0 else 0
    
    def time_to_frame(self, time_seconds: float) -> int:
        """Convert time in seconds to frame index."""
        frame_idx = int(time_seconds * self.fps)
        return max(0, min(frame_idx, self.numberOfFrames - 1))

    def frame_to_time(self, frame_idx: int) -> float:
        """Convert frame index to time in seconds."""
        return frame_idx / self.fps if self.fps > 0 else 0