from typing import Dict, List, Tuple, Union
import tifffile
import numpy as np 
import zarr
import xmltodict

from PIL import Image
from dataclasses import dataclass, field
from tifffile import TiffWriter, TiffFile, imread
from tifffile.tifffile import ZarrTiffStore
from zarr.hierarchy import Group 
from zarr.core import Array
from util.enums import FrameType
import openslide

@dataclass
class Properties:
    mppx: float
    mppy: float
    zpos: float = None
    zpos_unit: str = None
    compression: str = None
    objective_power: int = None
    manufacturer: str = None
    model: str = None
    image_name: str = None
    dtype: str = None 



@dataclass
class LabelImage:
    filename: str
    series: int
    data: Array = field(init=False, repr=False)

    def __post_init__(self):
        # TODO: validate filename
        # TODO: validate series
        self.data = zarr.open(
            imread(self.filename, series=self.series, aszarr=True), 
            mode='r'
            )
        
    @property
    def dimensions(self) -> Tuple[int, int]:
        """Returns (width, height) tuple of the image."""
        return self.data.shape[:2][::-1]
    
    @property
    def get_data(self) -> np.ndarray:
        """Returns the content of the image as numpy array."""
        return self.data[:]


@dataclass
class ThumbNail:
    filename: str
    series: int
    data: Array = field(init=False, repr=False)

    def __post_init__(self):
        # TODO: validate filename
        # TODO: validate series
        self.data = zarr.open(
            imread(self.filename, series=self.series, aszarr=True), 
            mode='r'
            )
         
    @property
    def dimensions(self) -> Tuple[int, int]:
        """Returns (width, height) tuple of the image."""
        return self.data.shape[:2][::-1]
    
    @property
    def get_data(self) -> np.ndarray:
        """Returns the content of the image as numpy array."""
        return self.data[:]


@dataclass
class PyramidalTIFF:
    filename: str
    series: int
    data: Group = field(init=False, repr=False)

    def __post_init__(self):
        # TODO: validate filename
        # TODO: validate series
        self.data = zarr.open(
            imread(self.filename, series=self.series, aszarr=True), 
            mode='r'
            )


    @property
    def level_count(self) -> int:
        """The number of levels in the image."""
        return len(self.data)
    

    @property
    def level_dimensions(self) -> List[Tuple[int, int]]:
        """A list of (width, height) tuples, one for each level of the image."""
        return [arr.shape[:2][::-1] for _, arr in self.data.arrays()]
    

    @property
    def dimensions(self):
        """A (width, height) tuple for level 0 of the image."""
        return self.level_dimensions[0]
    

    @property
    def level_downsamples(self) -> List[float]:
        """A list of downsampling factors for each level of the image."""
        down_factors = []
        reference_size = self.dimensions[0]
        for dim in self.level_dimensions:
            factor = reference_size / dim[0]
            down_factors.append(factor)
        return down_factors




    def read_region(
            self, 
            location: Tuple[int, int],
            level: int,
            size: Tuple[int, int]
            ) -> Image:
        """Return a PIL.Image containing the contents of the region.

        Args:
            location (Tuple[int, int]): (x, y) tuple giving the top left pixel.
            level (int): The level number. 
            size (Tuple[int, int]): (width, height) tuple giving the region size. 

        Returns:
            Image: Pil.Image with the contents of the region.
        """
        # correct location for level
        location = [round(x/self.level_downsamples[level]) for x in location]

        # create transparancy
        img = np.zeros((size[1],size[0],4), np.uint8)
        img[:,:,3]=255
        offset=[0,0]
        if (location[1]<0):
            offset[0] = -location[1]
            location = (location[0],0)
        if (location[0]<0):
            offset[1] = -location[0]
            location = (0,location[1])
        
        if level > self.level_count:
            raise ValueError(f'Invalid level.')
        
        if size[0] < 0 or size[1] < 0:
            raise ValueError(f'Negative width {size[0]} or negative height {size[1]} not allowed.')
         
        x, y = location
        width, height = size 
        imgcut = self.data[level][y:y+height, x:x+width, :]

        img[offset[0]:imgcut.shape[0]+offset[0],offset[1]:offset[1]+imgcut.shape[1],0:3] = imgcut
        return Image.fromarray(img)
    



@dataclass
class PyramidalZStack:
    filename: str
    zstack: Dict[str, PyramidalTIFF] = field(init=False, repr=False)
    labelimage: LabelImage = field(init=False, repr=False)
    thumbnail: ThumbNail = field(init=False, repr=False)


    def __post_init__(self):
        self.tif = TiffFile(self.filename)

        self._init_metadata()
        self._init_z_stack()


    @property
    def level_count(self) -> int:
        """The number of levels in the image."""
        return self.zstack[0].level_count

    @property 
    def level_dimensions(self) -> List[Tuple[int, int]]:
        """A list of (width, height) tuples, one for each level of the image."""
        return self.zstack[0].level_dimensions

    @property 
    def level_downsamples(self) -> List[float]:
        """A list of downsampling factors for each level of the image."""
        return self.zstack[0].level_downsamples

    @property
    def dimensions(self):
        """A (width, height) tuple for level 0 of the image."""
        return self.zstack[0].dimensions
    

    def __len__(self) -> int:
        """Returns the number of z-levels."""
        return len(self.zstack)

    @property
    def nFrames(self) -> int:
        """ returns the number of frames (identical to number of z levels) """
        return len(self.zstack)
    
    @property
    def frame_type(self) -> FrameType:
        return FrameType.ZSTACK

    @property
    def frame_descriptors(self) -> list[str]:
        """ returns a list of strings, used as descriptor for each frame
        """

        return ['z=%s %s' % (str(self.metadata[m]['PositionZ']), self.metadata[m]['PositionZUnit']) for m in self.metadata if 'PositionZ' in self.metadata[m]]

    @property
    def default_frame(self) -> list[str]:
        return 0

    @property
    def properties(self) -> Dict[str, Union[str, float, int]]:
        """ returns a list of properties that all OpenSlide objects have
        """
        return {openslide.PROPERTY_NAME_BACKGROUND_COLOR:  '000000',
                openslide.PROPERTY_NAME_MPP_X: '0.12',
                openslide.PROPERTY_NAME_MPP_Y: '0.12',
                openslide.PROPERTY_NAME_OBJECTIVE_POWER:20,
                openslide.PROPERTY_NAME_VENDOR: ''}

    def _init_metadata(self) -> None:
        # TODO: add Vendor, Objective Power, Compression per level 
        # TODO: implement  property dataclass 
        metadata = {}

        # metadata is stored in page 0 
        xml_string = self.tif.pages[0].tags['ImageDescription'].value

        # each image metadata is stored as dict in a list
        image_list = xmltodict.parse(xml_string)['OME']['Image']

        for idx, image_dict in enumerate(image_list):
            name = image_dict['@Name']

            metadata[idx] = dict(
                name = name,
                dtype = image_dict['Pixels']['@Type'],
                SizeX = image_dict['Pixels']['@SizeX'],
                SizeY = image_dict['Pixels']['@SizeY'],
                SizeC = image_dict['Pixels']['@SizeC'],
            )

            # additional information not stored for Label Image and Thumbnail
            if 'Label' not in name and 'Thumbnail' not in name:

                metadata[idx].update(dict(
                    PhysicalSizeX = image_dict['Pixels']['@PhysicalSizeX'],
                    PhysicalSizeY = image_dict['Pixels']['@PhysicalSizeX'],
                    PhysicalSizeXUnit = image_dict['Pixels']['@PhysicalSizeXUnit'],
                    PhysicalSizeYUnit = image_dict['Pixels']['@PhysicalSizeYUnit'],
                    PositionZ = image_dict['Pixels']['Plane']['@PositionZ'],
                    PositionZUnit = image_dict['Pixels']['Plane']['@PositionZUnit']
                ))
        
        # store metadata 
        self.metadata = metadata

    def get_best_level_for_downsample(self,downsample):
        return np.argmin(np.abs(np.asarray(self.level_downsamples)-downsample))


    def _init_z_stack(self) -> None:
        """Initialize Z-Stack, LabelImage and Thumbnail.
        
        TODO: Add true ZStack positions, define default plane 
        """
        zstack = {}

        for idx, series in enumerate(self.tif.series):
            name = series.name 

            if 'Label' in name:
               self.labelimage = LabelImage(self.filename, series=idx)

            elif 'Thumbnail' in name:
               self.thumbnail = ThumbNail(self.filename, series=idx)

            else:
               zstack[idx] = PyramidalTIFF(self.filename, series=idx)


        self.zstack = zstack

    def get_thumbnail(self, size):
        return self.read_region((0,0),self.level_count-1, self.level_dimensions[-1]).resize(size)
        
    
    def read_region(
            self, 
            location: Tuple[int, int],
            level: int, 
            size: Tuple[int, int], 
            frame: int = 0) -> Image:
        """Return a PIL.Image containing the contents of the region.

        TODO: Add support to load regions from multiple zlevels.

        Args:
            location (Tuple[int, int]): (x, y) tuple giving the top left pixel.
            level (int): The level number. 
            size (Tuple[int, int]): (width, height) tuple giving the region size. 
            frame (int): Index of z-stack plane. 

        Returns:
            Image: Pil.Image with the contents of the region.
        """
        
        if frame not in self.zstack.keys():
            raise KeyError(f'Invalid zlevel: {frame}.')
        
        patch = self.zstack[frame].read_region(location, level, size)

        return patch






    






        
        




