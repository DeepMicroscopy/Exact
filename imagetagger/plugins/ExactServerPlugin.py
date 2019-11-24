from enum import Enum

from util.slide_server import SlideCache
from imagetagger.images.models import Image


class UpdatePolicy(Enum):
    UPDATE_ON_SCROLL_CHANGE = 0,
    UPDATE_ON_SLIDE_CHANGE = 1


class ViewPolicy(Enum):
    RGB_IMAGE = 1,
    NO_OVERLAY = 2,

class NavigationViewOverlayStatus(Enum):
    NEEDS_UPDATE = 0,
    UP_TO_DATE = 2,
    ERROR = 3

class ExactServerPlugin:
    _productName = None
    description = 'This is a sample plugin'
    shortName = 'SamplePlugin'
    enabled = False
    version = 0
    navigation_ext = "_navigator"

    def __init__(self, slide_cache: SlideCache):
        self.slide_cache = slide_cache

    def getNavigationUpdatePolicy(self):
        return UpdatePolicy.UPDATE_ON_SLIDE_CHANGE

    def getNavigationViewPolicy(self):
        return ViewPolicy.NO_OVERLAY

    def getNavigationViewOverlayStatus(self, image: Image):
        raise NotImplementedError("To be implemented")

    def getNavigationViewOverlay(self, image: Image):
        raise NotImplementedError("To be implemented")

    def updateNavigationViewOverlay(self, image: Image):
        raise NotImplementedError("To be implemented")

    @property
    def productName(self):
        return self._productName

    def __str__(self):
        return self.shortName


