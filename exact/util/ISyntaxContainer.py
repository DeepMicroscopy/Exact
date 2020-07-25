
# !/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright © 2019 Koninklijke Philips N.V. All Rights Reserved.

# A copyright license is hereby granted for redistribution and use of the 
# Software in source and binary forms, with or without modification, provided
# that the following conditions are met:
# • Redistributions of source code must retain the above copyright notice, this
#   copyright license and the following disclaimer.
# • Redistributions in binary form must reproduce the above copyright notice, 
#   this copyright license and the following disclaimer in the documentation 
#   and/ or other materials provided with the distribution.
# • Neither the name of Koninklijke Philips N.V. nor the names of its 
#   subsidiaries may be used to endorse or promote products derived from the 
#   Software without specific prior written permission.
# 
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" 
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE 
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE 
# ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE 
# LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR 
# CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF 
# SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS 
# INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN 
# CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) 
# ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
# OF THE POSSIBILITY OF SUCH DAMAGE.

import os
import traceback
import numpy as np
import sys
import ctypes
import platform
import pixelengine
import softwarerendercontext
import softwarerenderbackend

# Specify the path for the lib tiff dll
# Change this path according to your Operating System(OS)
if "win" in sys.platform:
    LIBTIFF = ctypes.cdll.LoadLibrary(r'libtiff-5.dll')
elif "Ubuntu" in platform.linux_distribution()[0]:
    LIBTIFF = ctypes.cdll.LoadLibrary(r'/usr/lib/x86_64-linux-gnu/libtiff.so')
if LIBTIFF is None:
    raise TypeError('Failed to load libtiff')

# TIFFTAG_* constants from the header file:
TIFFTAG_IMAGEWIDTH = 256
TIFFTAG_IMAGELENGTH = 257
TIFFTAG_TILEWIDTH = 322
TIFFTAG_TILELENGTH = 323
TIFFTAG_BITSPERSAMPLE = 258
TIFFTAG_COMPRESSION = 259
COMPRESSION_JPEG = 7
TIFFTAG_SAMPLESPERPIXEL = 277
TIFFTAG_PLANARCONFIG = 284
TIFFTAG_PHOTOMETRIC = 262
TIFFTAG_JPEGQUALITY = 65537
TIFFTAG_ORIENTATION = 274
ORIENTATION_TOPLEFT = 1
TIFFTAG_JPEGCOLORMODE = 65538
JPEGCOLORMODE_RGB = 1
TIFFTAG_SUBFILETYPE = 254
PHOTOMETRIC_RGB = 2
PHOTOMETRIC_YCBCR = 6
FILETYPE_REDUCEDIMAGE = 0x1
TIFFTAG_YCBCRSUBSAMPLING = 530
BITSPERSAMPLE = 8
SAMPLESPERPIXEL = 3
PLANARCONFIG = 1
JPEGQUALITY = 95
YCBCRHORIZONTAL = 2
YCBCRVERTICAL = 2
TIFF_TILE_WIDTH = 512
TIFF_TILE_HEIGHT = 512


TIFFTAGS = {
    TIFFTAG_IMAGEWIDTH: (ctypes.c_uint32, lambda _d: _d.value),
    TIFFTAG_IMAGELENGTH: (ctypes.c_uint32, lambda _d: _d.value),
    TIFFTAG_SAMPLESPERPIXEL: (ctypes.c_uint32, lambda _d: _d.value),
    TIFFTAG_SUBFILETYPE: (ctypes.c_uint32, lambda _d: _d.value),
    TIFFTAG_TILELENGTH: (ctypes.c_uint32, lambda _d: _d.value),
    TIFFTAG_TILEWIDTH: (ctypes.c_uint32, lambda _d: _d.value),
    TIFFTAG_BITSPERSAMPLE: (ctypes.c_uint16, lambda _d: _d.value),
    TIFFTAG_COMPRESSION: (ctypes.c_uint16, lambda _d: _d.value),
    TIFFTAG_ORIENTATION: (ctypes.c_uint16, lambda _d: _d.value),
    TIFFTAG_PHOTOMETRIC: (ctypes.c_uint16, lambda _d: _d.value),
    TIFFTAG_PLANARCONFIG: (ctypes.c_uint16, lambda _d: _d.value),
    TIFFTAG_JPEGQUALITY: (ctypes.c_int, lambda _d: _d.value),
    TIFFTAG_JPEGCOLORMODE: (ctypes.c_int, lambda _d: _d.value),
    TIFFTAG_YCBCRSUBSAMPLING: (ctypes.c_int, lambda _d: _d.value)
}


class TIFF(ctypes.c_void_p):
    """ Holds a pointer to TIFF object.
    To open a tiff file for reading, use
    tiff = TIFF.open (filename, more='r')
    """

    @classmethod
    def open(cls, filename, mode='r'):
        """ Open tiff file as TIFF.
        """
        tiff = LIBTIFF.TIFFOpen(filename, mode)
        if tiff.value is None:
            raise TypeError('Failed to open file ' + b'filename')
        return tiff

    def WriteDirectory(self):
        """
        WriteDirectory
        :return: None
        """
        result = LIBTIFF.TIFFWriteDirectory(self)
        assert result == 1, result

    closed = False

    def close(self, lib_tiff):
        """
        Method to close tiff file handle
        :param lib_tiff: tiff file handle
        :return: None
        """
        if not self.closed and self.value is not None:
            lib_tiff.TIFFClose(self)
            self.closed = True

    def SetField(self, tag, value, count=None):
        """
        Set TIFF field value with tag.
        tag can be numeric constant TIFFTAG_<tagname> or a
        string containing <tagname>.
        :param tag: Tiff tag
        :param value: Tag value
        :param count:
        :return: result
        """
        if isinstance(tag, str):
            tag = eval('TIFFTAG_' + tag.upper())
        tiff_tag = TIFFTAGS.get(tag)
        if tiff_tag is None:
            print('Warning: no tag %r defined' % tag)
            return None
        data_type = tiff_tag[0]
        if data_type == ctypes.c_float:
            data_type = ctypes.c_double
        result = self.libtiff_set_field_interface(count, tag, data_type, value)
        return result

    def libtiff_set_field_interface(self, count, tag, data_type, value):
        """
        libtiff_set_field_interface
        :param count:
        :param tag: TIFF TAG
        :param data_type: data type
        :param value: Tag value
        :return: result
        """
        try:
            # value is an iterable
            data = data_type(*value)
        except TypeError:
            data = data_type(value)
        if count is None:
            LIBTIFF.TIFFSetField.argtypes = LIBTIFF.TIFFSetField.argtypes[:2] + [data_type]
            result = LIBTIFF.TIFFSetField(self, tag, data)
        else:
            LIBTIFF.TIFFSetField.argtypes = LIBTIFF.TIFFSetField.argtypes[:2] + [ctypes.c_uint,
                                                                                 data_type]
            result = LIBTIFF.TIFFSetField(self, tag, count, data)
        return result

LIBTIFF.TIFFOpen.restype = TIFF
LIBTIFF.TIFFOpen.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
LIBTIFF.TIFFSetField.restype = ctypes.c_int
LIBTIFF.TIFFSetField.argtypes = [TIFF, ctypes.c_uint, ctypes.c_void_p]  # last item is reset in
# TIFF.SetField method
LIBTIFF.TIFFWriteTile.restype = ctypes.c_int32
LIBTIFF.TIFFWriteTile.argtypes = [TIFF, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32,
                                  ctypes.c_uint32, ctypes.c_uint16]
LIBTIFF.TIFFWriteEncodedTile.restype = ctypes.c_int32
LIBTIFF.TIFFWriteEncodedTile.argtypes = [TIFF, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_int32]
LIBTIFF.TIFFClose.restype = None
LIBTIFF.TIFFClose.argtypes = [TIFF]


class ISyntaxContainer:

    def __init__(self, input_file):

        self.input_file = input_file

        render_context = softwarerendercontext.SoftwareRenderContext()
        render_backend = softwarerenderbackend.SoftwareRenderBackend()

        self.pixel_engine = pixelengine.PixelEngine(render_backend, render_context)
        self.pixel_engine["in"].open(input_file)

        self.num_levels = self.pixel_engine["in"].numLevels()

    def convert(self, target_path, level:int=0, tiff_type:int=1, sparse:int=0):

        # no idea why to byte encode.... 
        file_path = bytes(target_path, encoding='utf-8')

        if tiff_type == 0:
            tiff_file_handle = TIFF.open(file_path, mode=b'w')
        else:
            tiff_file_handle = TIFF.open(file_path, mode=b'w8')

        result = self.create_tiff_from_isyntax(self.pixel_engine, tiff_file_handle, level,
                                          int(self.num_levels),
                                          sparse)

        LIBTIFF.TIFFClose(tiff_file_handle)

        return result

    def create_tiff_from_isyntax(self, pixel_engine, tiff_file_handle, start_level,
                                num_levels, sparse):
        """
        Method to create tiff from isyntax file
        :param pixel_engine: Object of Pixel Engine
        :param tiff_file_handle: Tiff file handle
        :param start_level: Start level
        :param num_levels: max levels in isyntax file
        :param sparse: Sparse Flag
        :return: 0
        """
        view = pixel_engine["in"].SourceView()
        tiff_dim_x, tiff_dim_y = self.calculate_tiff_dimensions(view, start_level)
        #  Scanned Tissue Area
        # Level 0 represents 40x scan factor
        # So, in order save time and as per the requirement,
        #  one can start from a coarser resolution level say level 2 (10x)
        sub_level = False
        for level in range(start_level, num_levels + 1, 1):
            # Take starting point as the dimensionRange start on the View
            #  for a particular Level
            x_start = view.dimensionRanges(level)[0][0]
            x_end = x_start + tiff_dim_x
            y_start = view.dimensionRanges(level)[1][0]
            y_end = y_start + tiff_dim_y
            # As the index representation is always in Base Level i.e. Level0, but
            # the step size increase with level as (2**level)
            width_patch_level = TIFF_TILE_WIDTH * (2**level)
            height_patch_level = TIFF_TILE_HEIGHT * (2**level)
            width_roi = x_end - x_start
            height_roi = y_end - y_start
            #print("TIFF ROI Start and End Indices at Level - " + str(level))
            #print("xStart, xEnd, yStart, yEnd, width, height")
            #print(x_start, x_end, y_start, y_end, width_roi, height_roi)
            num_patches_x = int(width_roi / width_patch_level)
            num_patches_y = int(height_roi / height_patch_level)
            #print("Pad the image boundaries if the width or height is not an integer multiple of the "
            #    "patch size")
            mod_x = width_roi % width_patch_level
            mod_y = height_roi % height_patch_level
            #print(mod_x, mod_y)
            num_patches_x = self.check_mod(mod_x, num_patches_x)
            num_patches_y = self.check_mod(mod_y, num_patches_y)
            #print("Number of Tiles in X and Y directions " + str(num_patches_x) + "," + str(num_patches_y))
            # Error Resilience: Just in case if the number of patches at a given level in either
            # direction is 0, no point in writing tiff directory
            if num_patches_x * num_patches_y <= 0:
                #print("TIFF Directory Write bypassed")
                continue
            level_scale_factor = 2**level
            # For subdirectories corresponding to the multi-resolution pyramid, set the following
            # Tag for all levels but the initial level
            if sub_level:
                self.set_attribute(tiff_file_handle, TIFFTAG_SUBFILETYPE, FILETYPE_REDUCEDIMAGE)
            sub_level = True
            use_rgb = False  # Flag to choose bewteen RGB and YCbCr color model
            # Setting TIFF file attributes
            self.set_attribute(tiff_file_handle, TIFFTAG_IMAGEWIDTH, int(tiff_dim_x / level_scale_factor))
            self.set_attribute(tiff_file_handle, TIFFTAG_IMAGELENGTH, int(tiff_dim_y / level_scale_factor))
            self.set_attribute(tiff_file_handle, TIFFTAG_TILEWIDTH, TIFF_TILE_WIDTH)
            self.set_attribute(tiff_file_handle, TIFFTAG_TILELENGTH, TIFF_TILE_HEIGHT)
            self.set_tiff_file_attributes(tiff_file_handle, use_rgb)
            patches, patch_identifier = self.create_patch_list(num_patches_x, num_patches_y,
                                                        [x_start, y_start], level,
                                                        [width_patch_level, height_patch_level])
            bb_list = []
            if sparse == 1:
                bb_list = self.find_bounding_boxes(view, level)
            # Extract and Write TIFF Tiles
            self.tiff_tile_processor(pixel_engine, TIFF_TILE_WIDTH, TIFF_TILE_HEIGHT, level,
                                patches, patch_identifier,
                                tiff_file_handle, bb_list, sparse)
            tiff_file_handle.WriteDirectory()
        return 0


    def check_mod(self, mod, num_patches):
        """
        Checking mod value
        :param mod: modulus value
        :param num_patches: Number of patches
        :return: num_patches
        """
        if mod > 0:
            num_patches += 1
        return num_patches


    def calculate_tiff_dimensions(self, view, start_level):
        """
        Set the TIFF tile size
        Note that TIFF mandates tile size in multiples of 16
        Calculate the Image Dimension range from the View at the Start Level
        :param view: Source View
        :param start_level: Starting Level
        :return: tiff_dim_x, tiff_dim_y
        """
        x_start = view.dimensionRanges(start_level)[0][0]
        x_end = view.dimensionRanges(start_level)[0][2]
        y_start = view.dimensionRanges(start_level)[1][0]
        y_end = view.dimensionRanges(start_level)[1][2]
        range_x = x_end - x_start
        range_y = y_end - y_start
        # As the multi-resolution image pyramid in TIFF
        #  shall follow a down sample factor of 2
        # Normalize the Image Dimension from the coarsest level
        #  so that a downscale factor of 2 is maintained across levels
        # Size Normalization
        tiff_dim_x = int(range_x / TIFF_TILE_WIDTH) * TIFF_TILE_WIDTH
        tiff_dim_y = int(range_y / TIFF_TILE_HEIGHT) * TIFF_TILE_HEIGHT
        #print("Pad the image boundaries, if the width or height is not an integer multiple of the "
        #    "tile size")
        mod_x = range_x % TIFF_TILE_WIDTH
        mod_y = range_y % TIFF_TILE_HEIGHT
        #print(mod_x, mod_y)
        if mod_x > 0:
            tiff_dim_x += TIFF_TILE_WIDTH
        if mod_y > 0:
            tiff_dim_y += TIFF_TILE_HEIGHT
        return tiff_dim_x, tiff_dim_y

    def set_attribute(self, tiff_file_handle, key, value):
        """
        Set Tiff file attributes
        :param tiff_file_handle: Tiff file handle
        :param key: Associated key
        :param value: value of key
        :return: None
        """
        assert tiff_file_handle.SetField(key, value) == 1, \
            "could not set "+str(key)+" tag"


    def set_tiff_file_attributes(self, tiff_file_handle, use_rgb):
        """
        Setting tiff file common attributes
        :param tiff_file_handle: Tiff file handle
        :param use_rgb: RGB Flag
        :return: None
        """
        self.set_attribute(tiff_file_handle, TIFFTAG_BITSPERSAMPLE, BITSPERSAMPLE)
        self.set_attribute(tiff_file_handle, TIFFTAG_SAMPLESPERPIXEL, SAMPLESPERPIXEL)
        self.set_attribute(tiff_file_handle, TIFFTAG_PLANARCONFIG, PLANARCONFIG)
        self.set_attribute(tiff_file_handle, TIFFTAG_COMPRESSION, COMPRESSION_JPEG)
        self.set_attribute(tiff_file_handle, TIFFTAG_JPEGQUALITY, JPEGQUALITY)
        self.set_attribute(tiff_file_handle, TIFFTAG_ORIENTATION, ORIENTATION_TOPLEFT)
        if use_rgb:
            self.set_attribute(tiff_file_handle, TIFFTAG_PHOTOMETRIC, PHOTOMETRIC_RGB)
        else:
            self.set_attribute(tiff_file_handle, TIFFTAG_PHOTOMETRIC, PHOTOMETRIC_YCBCR)
            self.set_attribute(tiff_file_handle, TIFFTAG_JPEGCOLORMODE, JPEGCOLORMODE_RGB)
            assert tiff_file_handle.SetField(TIFFTAG_YCBCRSUBSAMPLING, YCBCRHORIZONTAL,
                                            YCBCRVERTICAL) == 1, "could not set YCbCr subsample tag"


    def create_patch_list(self, num_patches_x, num_patches_y, starting_indices, level, patch_size):
        """
        Method to create patches list and patch identifier list
        :param num_patches_x: Number of patches in x
        :param num_patches_y: Number of patches in y
        :param starting_indices: Starting indices
        :param level: Level
        :param patch_size: Size of patch
        :return: list of patches, patch_identifier
        """
        patches = []
        patch_identifier = []
        y_spatial = 0
        for y_counter in range(num_patches_y):
            y_patch_start = starting_indices[1] + (y_counter * patch_size[1])
            y_patch_end = y_patch_start + patch_size[1]
            x_spatial = 0
            for x_counter in range(num_patches_x):
                x_patch_start = starting_indices[0] + (x_counter * patch_size[0])
                x_patch_end = x_patch_start + patch_size[0]
                patch = [x_patch_start, x_patch_end - 2 ** level, y_patch_start,
                        y_patch_end - 2 ** level, level]
                patches.append(patch)
                patch_identifier.append([x_spatial, y_spatial])
                x_spatial += 1
            y_spatial += 1
        return patches, patch_identifier


    def find_bounding_boxes(self, view, level):
        """
        Method to create bounding box list
        :param view: Source View
        :param level: Current Level
        :return: bb_list
        """
        bb_list = []
        data_envelope = []
        step = 0
        for envelope in view.dataEnvelopes(level).dataEnvelopes():
            evalute = lambda envelope: (len(envelope) == 0 or
                                        len(envelope[1]) == 0 or len(envelope) > 2)
            if evalute(envelope):
                print("Data envelope is not having indices")
            else:
                print("Data envelope_" + str(step) + ": "+str(envelope[1]))
                data_envelope.append(envelope[1])
                data_env = data_envelope[step]
                final_range = self.create_view_range(data_env, level)
                bb_list.append(final_range)
                step = step + 1
        return bb_list


    def create_view_range(self, data_env, level):
        """
        Create view range for every data envelope
        :param data_env: Data Envelope Indices
        :param level: level of isyntax file
        :return: View range of Data Envelope
        """
        x_final_list = []
        y_final_list = []
        for index in range(0, len(data_env)):
            x_final_list.append(data_env[index][0])
            y_final_list.append(data_env[index][1])
        # Creating a list of the input argument
        x_start = min(x_final_list)
        y_start = min(y_final_list)
        x_end = max(x_final_list)
        y_end = max(y_final_list)
        final_range = [x_start, (x_end - (2 ** level)), y_start, (y_end - (2 ** level)),
                    level]
        return final_range


    def tiff_tile_processor(self, pixel_engine, tile_width, tile_height, level, patches,
                            patch_identifier, tiff_file_handle, bb_list, sparse):
        """
        Tiff Tile Processor
        :param pixel_engine: Object of pixel Engine
        :param tile_width: Tile Width
        :param tile_height: Tile Height
        :param level: Level
        :param patches: List of patches
        :param patch_identifier: Identifier list to map patches when fetched from pixel engine
        :param tiff_file_handle: Tiff file handle
        :param bb_list: Bounding Box List
        :param sparse: Sparse Flag
        :return: None
        """
        view = pixel_engine["in"].SourceView()
        samples_per_pixel = 3  # As we queried RGB for Pixel Data
        patch_data_size = int((tile_width * tile_height * samples_per_pixel))
        data_envelopes = view.dataEnvelopes(level)
        #print("Requesting patches. Preparing patch definitions...")
        regions = view.requestRegions(patches, data_envelopes, True, [255, 0, 0],
                                    pixel_engine.BufferType(0))
        #print("Request Complete. Patch definitions ready.")
        while regions:
            #print("Requesting regions batch")
            regions_ready = pixel_engine.waitAny(regions)
            #print("Regions returned = " + str(len(regions_ready)))
            for region in regions_ready:
                # Find the index of obtained Region in Original PatchList
                patch_id = patch_identifier[regions.index(region)]
                x_spatial = patch_id[0]
                y_spatial = patch_id[1]
                patch = np.empty(int(patch_data_size)).astype(np.uint8)
                region.get(patch)
                # Set the spatial location to paste in the TIFF file
                x_value = x_spatial * tile_width
                y_value = y_spatial * tile_height
                self.write_tiff_tile(tiff_file_handle, [x_value, y_value], level, sparse,
                                patch.ctypes.data, patch_data_size, bb_list, region)
                regions.remove(region)
                patch_identifier.remove(patch_id)

    def write_tiff_tile(self, tiff_handle, offset, level, sparse, data, data_size, bb_list, region):
        """
        Save extracted regions as Patches to Disk
        :param tiff_handle: Tiff file handle
        :param offset: List of Offset Indices
        :param level: Level of Tile
        :param sparse: Sparse Flag
        :param data: Buffer
        :param data_size: Size of buffer
        :param bb_list: Bounding box list
        :param region : Current region
        :return: None
        """
        try:
            # check sparse and background tiles
            if sparse == 1:
                is_background = self.is_background_tile(bb_list, region.range)
                if is_background:
                    #print("Background Tile")
                    #print(region.range)
                    return
            # Write Tile
            if LIBTIFF.TIFFWriteEncodedTile(tiff_handle, LIBTIFF.TIFFComputeTile
                                            (tiff_handle, offset[0], offset[1],
                                            level, 0), data, data_size) < 0:
                # ToDo: Repleace with exception
                print("Error in generating TIFF")
        except RuntimeError:
            traceback.print_exc()


    def is_background_tile(self, bb_list, bb_range):
        """
        Method to check background tile
        :param bb_list: Data envelope list
        :param bb_range: Tile view range
        :return: outside_x or outside_y
        """
        outside_x = True
        outside_y = True
        for data_envelope in bb_list:
            if(not((bb_range[0] < data_envelope[0] and bb_range[1] < data_envelope[0]) or
                (bb_range[0] > data_envelope[1] and bb_range[1] > data_envelope[1]))):
                outside_x = False
                break
        for data_envelope in bb_list:
            if(not((bb_range[2] < data_envelope[2] and bb_range[3] < data_envelope[2]) or
                (bb_range[2] > data_envelope[3] and bb_range[3] > data_envelope[3]))):
                outside_y = False
                break
        return outside_x or outside_y