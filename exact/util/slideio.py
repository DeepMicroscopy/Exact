"""
        This file provides support for loading slides with the slideio library.
"""

import numpy as np
from pydicom.encaps import decode_data_sequence
from PIL import Image
import io
import os
import struct
from os import stat
import openslide
import slideio
from util.enums import FrameType



class SlideIOSlide():
    """[summary]
        This is just temoporary until SlideRunner make its data access layer pip installable 
    Returns:
        [type]: [description]
    """

    def __init__(self,filename):
        self.fileName = filename
        self.fh = slideio.open_slide(filename)
        self.scene = self.fh.get_scene(0)


        self.geometry_imsize = self.scene.rect[2:4]
        self.geometry_tilesize =  [(self.scene.get_zoom_level_info(k).tile_size.width,self.scene.get_zoom_level_info(k).tile_size.height) for k in range(self.scene.num_zoom_levels)]
        self.geometry_columns = [np.ceil(self.scene.get_zoom_level_info(k).size.width/self.scene.get_zoom_level_info(k).tile_size.width) for k in range(self.scene.num_zoom_levels)]
        self.geometry_rows = [np.ceil(self.scene.get_zoom_level_info(k).size.height/self.scene.get_zoom_level_info(k).tile_size.height) for k in range(self.scene.num_zoom_levels)]

        self.imsize = self.scene.rect[2:4]
        self.levels = [1]
        self.mpp_x = self.scene.resolution[0]*1e6
        self.mpp_y  = self.scene.resolution[1]*1e6
        self.mode = 'RGBA' # normally, it is RGB not BGR

        # Zeiss is funny and thinks BGR is the proper way to store images ...
        if (os.path.splitext(filename.upper())[-1] == '.CZI'):
            self.mode = 'BGRA'
        
    
        #print('Circular mask shape:',self.circMask.shape)
        self.properties = { openslide.PROPERTY_NAME_BACKGROUND_COLOR:  '000000',
                           openslide.PROPERTY_NAME_MPP_X: self.mpp_x,
                           openslide.PROPERTY_NAME_MPP_Y: self.mpp_y,
                           openslide.PROPERTY_NAME_OBJECTIVE_POWER:self.scene.magnification,
                           openslide.PROPERTY_NAME_VENDOR: 'VSI'}
    

    @property
    def seriesInstanceUID(self) -> str:
        return ''

    @property
    def level_downsamples(self):
        return [1/self.scene.get_zoom_level_info(k).scale for k in range(self.scene.num_zoom_levels)]

    @property 
    def level_dimensions(self):
        return [[self.scene.get_zoom_level_info(k).size.width, self.scene.get_zoom_level_info(k).size.height] for k in range(self.scene.num_zoom_levels)]

    @property 
    def nFrames(self):
        return 0
    
    @property
    def frame_descriptors(self) -> list[str]:
        """ returns a list of strings, used as descriptor for each frame
        """
        return 0

    @property
    def frame_descriptors(self) -> list[str]:
        return 0


    @property 
    def nLayers(self):
        return self.scene.num_z_slices

    @property
    def layer_descriptors(self) -> list[str]:
        """ returns a list of strings, used as descriptor for each layer
        """
        return ['%.2f µ' % (self.scene.z_resolution*1E6*x) for x in range(self.scene.num_z_slices)]

    @property
    def frame_type(self):
        return FrameType.TIMESERIES


    def get_thumbnail(self, size):
        return Image.fromarray(self.scene.read_block(rect=[0, 0, *self.scene.rect[2:]], size=size))


    def read_region(self, location: tuple, level:int, size:tuple, frame:int=0):
        ds = self.scene.get_zoom_level_info(level).scale
        img = self.scene.read_block(rect=[*location, int(size[0]/ds), int(size[1]/ds)], size=size)
        img_4ch = np.zeros([size[1], size[0],4], dtype=np.uint8)
        img_4ch[:,:,3] = 255
        img_4ch[:,:,0:3] = img if self.mode=='RGBA' else img[:,:,::-1]
        return Image.fromarray(img_4ch)

    @property
    def dimensions(self):
        return self.level_dimensions[0]

    def get_best_level_for_downsample(self,downsample):
        return np.argmin(np.abs(np.asarray(self.level_downsamples)-downsample))

    @property
    def level_count(self):
        return len(self.levels)

    def imagePos_to_id(self, imagePos:tuple, level:int):
        id_x, id_y = imagePos
        if (id_y>=self.geometry_rows[level]):
            id_x=self.geometry_columns[level] # out of range

        if (id_x>=self.geometry_columns[level]):
            id_y=self.geometry_rows[level] # out of range
        return (id_x+(id_y*self.geometry_columns[level]))
    

    def get_id(self, pixelX:int, pixelY:int, level:int) -> (int, int, int):

        id_x = round(-0.5+(pixelX/self.geometry_tilesize[level][1]))
        id_y = round(-0.5+(pixelY/self.geometry_tilesize[level][0]))
        
        return (id_x,id_y), pixelX-(id_x*self.geometry_tilesize[level][0]), pixelY-(id_y*self.geometry_tilesize[level][1]),