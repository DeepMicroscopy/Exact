from enum import Enum

from util.slide_server import SlideCache
from imagetagger.images.models import Image


class UpdatePolicy(str, Enum):
    UPDATE_ON_SCROLL_CHANGE = "UPDATE_ON_SCROLL_CHANGE",
    UPDATE_ON_SLIDE_CHANGE = "UPDATE_ON_SLIDE_CHANGE"


class ViewPolicy(str, Enum):
    RGB_IMAGE = "RGB_IMAGE",
    NO_OVERLAY = "NO_OVERLAY",


class NavigationViewOverlayStatus(str, Enum):
    NEEDS_UPDATE = "NEEDS_UPDATE",
    UP_TO_DATE = "UP_TO_DATE",
    ERROR = "ERROR"


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


    def getStatisticsUpdatePolicy(self):
        return UpdatePolicy.UPDATE_ON_SLIDE_CHANGE

    def getPluginStatisticsElements(self, image: Image, option ={}):
        raise NotImplementedError("To be implemented")


    @property
    def productName(self):
        return self._productName

    def __str__(self):
        return self.shortName


