from rest_framework import routers

from exact.users import api_views as users_views
from exact.images import api_views as images_views
from exact.administration import api_views as administrations_views
from exact.annotations import api_views as annotations_views


router = routers.DefaultRouter()

router.register(r'users/users', users_views.UserViewset)
router.register(r'users/teams', users_views.TeamViewset)
router.register(r'users/team_membership', users_views.TeamMembershipViewset)

router.register(r'images/images', images_views.ImageViewSet)
router.register(r'images/image_sets', images_views.ImageSetViewSet)
router.register(r'images/set_tags', images_views.SetTagViewSet)
router.register(r'images/screening_modes', images_views.ScreeningModeViewSet)

router.register(r'annotations/annotations', annotations_views.AnnotationViewSet)
router.register(r'annotations/annotation_types', annotations_views.AnnotationTypeViewSet)
router.register(r'annotations/annotation_media_files', annotations_views.AnnotationMediaFileViewSet)
router.register(r'annotations/verifications', annotations_views.VerificationViewSet)
router.register(r'annotations/log_image_actions', annotations_views.LogImageActionViewSet)


router.register(r'administration/products', administrations_views.ProductViewset)

