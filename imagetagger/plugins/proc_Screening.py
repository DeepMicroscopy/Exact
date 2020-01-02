import numpy as np
from pathlib import Path
import os
from datetime import datetime
from PIL import Image as PIL_Image
import cv2
import base64

from django.contrib.auth import get_user_model
from django.template.loader import render_to_string
from django.db.models.functions import Cast

from imagetagger.annotations.models import AnnotationType
from imagetagger.images.models import Image, ScreeningMode

from util.slide_server import SlideCache, SlideFile, PILBytesIO
from plugins.ExactServerPlugin import \
    ExactServerPlugin, UpdatePolicy, ViewPolicy, NavigationViewOverlayStatus


class Plugin(ExactServerPlugin):
    _productName = ''
    version = 1
    shortName = 'Screening'
    description = 'General Screening'
    thumbnail_size_x = 255
    thumbnail_size_y = 255


    def getStatisticsUpdatePolicy(self):
        return UpdatePolicy.UPDATE_ON_SCROLL_CHANGE

    def getPluginStatisticsElements(self, image: Image, user: get_user_model(), options={}):

        tab_id = "Screening"


        image_width = image.width
        image_height = image.height

        screening = image.screening.filter(user=user).first()
        resolution_x, resolution_y = None, None
        # get resolution
        # first check if set by user
        # second load from database for that image
        # third load from dataset by current user
        # finally load from any user
        if "resolution_x" in options and "resolution_y" in options:
            resolution_x = int(options["resolution_x"])
            resolution_y = int(options["resolution_y"])
        elif screening:
            resolution_x = screening.x_resolution
            resolution_y = screening.y_resolution
        else:
            image_with_screening_result = image.image_set.images.filter(screening__user=user).first()
            if image_with_screening_result:
                temp_screening = image.image_set.images.filter(screening__user=user)\
                    .first().screening.filter(user=user).first()
                resolution_x = temp_screening.x_resolution
                resolution_y = temp_screening.y_resolution
            else:
                temp_screening = image.image_set.images.filter() \
                        .first().screening.filter().first()
                if temp_screening:
                    resolution_x = temp_screening.x_resolution
                    resolution_y = temp_screening.y_resolution

        if screening:
            # check if screening resolution has changed and need update
            if resolution_x is not None and resolution_y is not None and \
                    screening.x_resolution != resolution_x or screening.y_resolution != resolution_y:

                tile_dict, x_steps, y_steps = self._create_tiles(resolution_x, resolution_y, image_width, image_height)

                screening.x_steps = x_steps
                screening.y_steps = y_steps
                screening.x_resolution = resolution_x
                screening.y_resolution = resolution_y
                screening.screening_tiles = tile_dict
                screening.Save()
        elif resolution_x is not None and resolution_y is not None and \
                "resolution_x" in options and "resolution_y" in options:
            tile_dict, x_steps, y_steps = self._create_tiles(resolution_x, resolution_y, image_width, image_height)
            screening = ScreeningMode(image=image,
                                      user=user,
                                      screening_tiles=tile_dict,
                                      x_resolution=resolution_x,
                                      y_resolution=resolution_y,
                                      x_steps=len(x_steps),
                                      y_steps=len(y_steps))
            screening.save()

        img_str = None
        if screening:
            if "current_index" in options:
                screening.current_index = options['current_index']
                if screening.current_index in screening.screening_tiles:
                    screening.screening_tiles[screening.current_index]['Screened'] = True
                    screening.save()
                elif str(screening.current_index) in screening.screening_tiles:
                    screening.screening_tiles[str(screening.current_index)]['Screened'] = True
                    screening.save()

            slide = self.slide_cache.get(image.path())

            tile = slide._osr.get_thumbnail((self.thumbnail_size_x, self.thumbnail_size_y))

            scale_x, scale_y = image_width / self.thumbnail_size_x, image_height / self.thumbnail_size_y
            tile = self.draw_tiles(tile, screening.screening_tiles, scale_x, scale_y, screening.current_index)

            tile = PIL_Image.fromarray(tile)
            buf = PILBytesIO()
            tile.save(buf, 'png', quality=90)
            img_str = str(base64.b64encode(buf.getvalue()))[2:-1]

        rendering = render_to_string('Screening/Screening.html', {
            'image_id': image.id,
            'tab_id': tab_id,
            'image': img_str,
            'resolution_x': resolution_x,
            'resolution_y': resolution_y})

        return {
            'id': tab_id,
            'content':  rendering,
            'screening_tile_status': screening.screening_tiles if screening else {},
            'x_steps': screening.x_steps if screening else 0,
            'y_steps': screening.y_steps if screening else 0,
            'current_index': screening.current_index if screening else None,
            'update_policy': self.getStatisticsUpdatePolicy()
        }

    def draw_tiles(self, image, tiles_dict, scale_x, scale_y, current_index=None):

        image = np.array(image)

        for key, value in tiles_dict.items():
            x_min = int(value['x_min'] / scale_x)
            y_min = int(value['y_min'] / scale_y)
            x_max = int(value['x_max'] / scale_x)
            y_max = int(value['y_max'] / scale_y)
            screened = value['Screened'] == True

            if current_index and current_index == int(key):
                cv2.rectangle(image, (x_min, y_min), (x_max, y_max), (255, 0, 255), 5)
            elif screened:
                cv2.rectangle(image, (x_min, y_min), (x_max, y_max), (0, 255, 0), -1 if screened else 1)

        return image

    def _create_tiles(self, resolution_x, resolution_y, image_width, image_height):

        screeningTiles = {}

        index = 0

        x_steps = range(0, image_width, resolution_x)
        y_steps = range(0, image_height, resolution_y)

        for y in y_steps:
            for x in x_steps:
                screeningTiles[index] = {}
                screeningTiles[index]['Screened'] = False
                screeningTiles[index]['x_min'] = x
                screeningTiles[index]['y_min'] = y
                screeningTiles[index]['x_max'] = x + resolution_x
                screeningTiles[index]['y_max'] = y + resolution_y

                index += 1

        return screeningTiles, x_steps, y_steps