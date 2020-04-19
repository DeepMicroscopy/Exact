from rest_framework import routers

from exact.users import api_views as users_views
from exact.images import api_views as images_views
from exact.administration import api_views as administrations_views
from exact.annotations import api_views as annotations_views

router = routers.DefaultRouter()

router.register(r'users/users', users_views.UserViewset, basename='User')
router.register(r'users/teams', users_views.TeamViewset, basename='Team')
router.register(r'users/team_membership', users_views.TeamMembershipViewset, basename='TeamMembership')

router.register(r'images/images', images_views.ImageViewSet, basename='Image')
router.register(r'images/image_sets', images_views.ImageSetViewSet, basename='ImageSet')
router.register(r'images/set_tags', images_views.SetTagViewSet, basename='SetTag')
router.register(r'images/screening_modes', images_views.ScreeningModeViewSet, basename='ScreeningMode')

router.register(r'annotations/annotations', annotations_views.AnnotationViewSet, basename='Annotation')
router.register(r'annotations/annotation_types', annotations_views.AnnotationTypeViewSet, basename='AnnotationType')
router.register(r'annotations/annotation_media_files', annotations_views.AnnotationMediaFileViewSet, basename='AnnotationMediaFile')
router.register(r'annotations/verifications', annotations_views.VerificationViewSet, basename='Verification')
router.register(r'annotations/log_image_actions', annotations_views.LogImageActionViewSet, basename='LogImageAction')


router.register(r'administration/products', administrations_views.ProductViewset, basename='Product')

