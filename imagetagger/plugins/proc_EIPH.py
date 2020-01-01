import numpy as np
from pathlib import Path
import os
from datetime import datetime
from PIL import Image as PIL_Image
import cv2

from django.contrib.auth import get_user_model
from django.template.loader import render_to_string
from django.db.models import Count, Q, Sum, Avg, FloatField
from django.db.models.functions import Cast

from imagetagger.annotations.models import AnnotationType
from imagetagger.images.models import Image, ImageSet


from plugins.ExactServerPlugin import \
    ExactServerPlugin, UpdatePolicy, ViewPolicy, NavigationViewOverlayStatus


class Plugin(ExactServerPlugin):
    _productName = 'EIPH'
    version = 1
    shortName = 'EIPH'
    description = 'EIPH Analysis'
    width, hight = (256, 256)
    headmap_resolution = 1024


    def getNavigationViewPolicy(self):
        return ViewPolicy.RGB_IMAGE

    def getNavigationUpdatePolicy(self):
        return UpdatePolicy.UPDATE_ON_SLIDE_CHANGE

    def updateNavigationViewOverlay(self, image: Image):

        file_path = image.path()

        file_path_navigator = \
            Path(os.path.join(Path(image.path()).parent, Path(image.path()).stem + "_navigator") + ".png")
        # check if navigator overlay image exist
        # and was calculated after the annotation change

        if file_path_navigator.exists() is False or datetime.utcfromtimestamp(os.stat(file_path_navigator).st_mtime) \
                < image.annotations.latest('last_edit_time').last_edit_time.replace(tzinfo=None):
            slide = self.slide_cache.get(file_path)

            tile = np.array(slide._osr.get_thumbnail((self.width, self.hight)))

            x_steps = range(0, slide._osr.level_dimensions[0][0] - 2 * self.headmap_resolution,
                            int(self.headmap_resolution / 2))
            y_steps = range(0, slide._osr.level_dimensions[0][1] - 2 * self.headmap_resolution,
                            int(self.headmap_resolution / 2))

            gt_image = np.zeros(shape=(len(x_steps) + 1, len(y_steps) + 1))
            annotations = np.array(
                [[a.vector['x1'], a.vector['y1'], a.vector['x2'], a.vector['y2'], int(a.annotation_type.name)]
                 for a in image.annotations.filter(annotation_type__active=True, deleted=False).all()])

            # image.annotations.filter(vector__x1__gte=x_min, vector__y1__gte=y_min, vector__x2__lte=x_max,
            # vector__y2__lte=y_max).annotate(name_as_int=Cast('annotation_type__name', FloatField()))
            # .aggregate(Avg('name_as_int'))['name_as_int__avg']

            if image.annotations.filter(annotation_type__active=True, deleted=False).exists():
                x_index = 0
                for x in x_steps:
                    y_index = 0
                    for y in y_steps:
                        ids = ((annotations[:, 1]) > x) \
                              & ((annotations[:, 0]) > y) \
                              & ((annotations[:, 3]) < x + self.headmap_resolution) \
                              & ((annotations[:, 2]) < y + self.headmap_resolution)

                        score = np.mean(annotations[ids, 4]) if np.count_nonzero(ids) > 1 else 0
                        gt_image[x_index, y_index] = score

                        y_index += 1
                    x_index += 1
                gt_image = np.expand_dims(gt_image * (255. / 4), axis=2).astype(np.uint8)
                overlay = cv2.applyColorMap(gt_image, cv2.COLORMAP_JET)[::-1]
                # Mask overlay
                overlay[np.array(gt_image == 0)[:, :, [0, 0, 0]]] = [255]
                overlay = cv2.resize(overlay, tile.shape[:2][::-1])

                PIL_Image.fromarray(overlay).save(str(file_path_navigator))



    def getNavigationViewOverlayStatus(self, image: Image):

        file_path_navigator = \
            Path(os.path.join(Path(image.path()).parent, Path(image.path()).stem + self.navigation_ext) + ".png")

        slide = self.slide_cache.get(image.path())
        if slide._osr.level_dimensions[0][0] < 10000:
            return NavigationViewOverlayStatus.ERROR
        elif file_path_navigator.exists() is False or datetime.utcfromtimestamp(os.stat(file_path_navigator).st_mtime) \
                < image.annotations.latest('last_edit_time').last_edit_time.replace(tzinfo=None):
            return NavigationViewOverlayStatus.NEEDS_UPDATE
        else:
            return NavigationViewOverlayStatus.UP_TO_DATE

    def getNavigationViewOverlay(self, image: Image):

        file_path_navigator = \
            Path(os.path.join(Path(image.path()).parent, Path(image.path()).stem + self.navigation_ext) + ".png")

        if file_path_navigator.exists():
            return PIL_Image.open(str(file_path_navigator))
        # create new image
        else:
            self.updateNavigationViewOverlay(image)
            return PIL_Image.open(str(file_path_navigator))

    def getStatisticsUpdatePolicy(self):
        return UpdatePolicy.UPDATE_ON_SCROLL_CHANGE

    def getPluginStatisticsElements(self, image: Image, user: get_user_model(), options={}):

        tab_id = "EIPH_Statistics"

        slide = self.slide_cache.get(image.path())

        x_min = int(options.get("min_x", 0))
        x_max = int(options.get("max_x", slide._osr.level_dimensions[0][0]))
        y_min = int(options.get("min_y", 0))
        y_max = int(options.get("max_y", slide._osr.level_dimensions[0][1]))

        if image.image_set.collaboration_type == ImageSet.CollaborationTypes.COMPETITIVE:
            annotation_types = AnnotationType.objects.filter(annotation__image=image,
                                                             active=True,
                                                             annotation__deleted=False,
                                                             annotation__user=user,
                                                             annotation__vector__x1__gte=x_min,
                                                             annotation__vector__y1__gte=y_min,
                                                             annotation__vector__x2__lte=x_max,
                                                             annotation__vector__y2__lte=y_max)
        else:
            annotation_types = AnnotationType.objects.filter(annotation__image=image,
                                                             active=True,
                                                             annotation__deleted=False,
                                                             annotation__vector__x1__gte=x_min,
                                                             annotation__vector__y1__gte=y_min,
                                                             annotation__vector__x2__lte=x_max,
                                                             annotation__vector__y2__lte=y_max)

        annotation_types = annotation_types.distinct().order_by('sort_order').annotate(count=Count('annotation'))

        doucet_score = 0
        annotations_total = annotation_types.aggregate(Sum('count'))['count__sum']
        if annotations_total is not None:
            doucet_score = sum([a['count'] / (annotations_total / 100) * int(a['name'])
                                for a in annotation_types.values()])
            doucet_score = '{:f}'.format(doucet_score)

        rendering = render_to_string('EIPH/EIPH_Statistics.html', {
            'tab_id': tab_id,
            'annotation_types': annotation_types,
            'doucet_score': doucet_score})

        return {
            'id': tab_id,
            'content':  rendering,
            'update_policy': self.getStatisticsUpdatePolicy()
        }







