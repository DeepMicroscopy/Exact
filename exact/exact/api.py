from rest_framework import routers

from exact.users import api_views as users_views
from exact.images import api_views as images_views
from exact.administration import api_views as administrations_views
from exact.annotations import api_views as annotations_views

router = routers.DefaultRouter()
router_api = routers.DefaultRouter()

router_api.register(r'users/users', users_views.UserViewset, basename='User')
router_api.register(r'users/teams', users_views.TeamViewset, basename='Team')
router_api.register(r'users/team_membership', users_views.TeamMembershipViewset, basename='TeamMembership')

router_api.register(r'images/images', images_views.ImageViewSet, basename='Image')
router_api.register(r'images/image_sets', images_views.ImageSetViewSet, basename='ImageSet')
router_api.register(r'images/set_tags', images_views.SetTagViewSet, basename='SetTag')
router_api.register(r'images/set_versions', images_views.SetVersionViewSet, basename='SetVersion')
router_api.register(r'images/screening_modes', images_views.ScreeningModeViewSet, basename='ScreeningMode')
router_api.register(r'images/registration', images_views.ImageRegistrationViewSet, basename='ImageRegistration')

router_api.register(r'annotations/annotations', annotations_views.AnnotationViewSet, basename='Annotation')
router_api.register(r'annotations/annotation_versions', annotations_views.AnnotationVersionViewSet, basename='AnnotationVersion')
router_api.register(r'annotations/annotation_types', annotations_views.AnnotationTypeViewSet, basename='AnnotationType')
router_api.register(r'annotations/annotation_media_files', annotations_views.AnnotationMediaFileViewSet, basename='AnnotationMediaFile')
router_api.register(r'annotations/verifications', annotations_views.VerificationViewSet, basename='Verification')
router_api.register(r'annotations/log_image_actions', annotations_views.LogImageActionViewSet, basename='LogImageAction')


router_api.register(r'administration/products', administrations_views.ProductViewset, basename='Product')



router.register(r'images/image_sets_explore', images_views.ImageSetViewSet, basename='ImageSetView')
router.register(r'images/images_explore', images_views.ImageViewSet, basename='ImageView')
router.register(r'images/versions_explore', images_views.SetVersionViewSet, basename='VersionView')

router.register(r'annotations/annotation_types_explore', annotations_views.AnnotationTypeViewSet, basename='AnnotationTypeView')
router.register(r'annotations/annotations_explore', annotations_views.AnnotationViewSet, basename='AnnotationView')
router.register(r'annotations/annotations_media_files_explore', annotations_views.AnnotationMediaFileViewSet, basename='AnnotationMediaFileView')
router.register(r'annotations/annotation_versions_explore', annotations_views.AnnotationVersionViewSet, basename='AnnotationVersionView')


router.register(r'administration/products_explore', administrations_views.ProductViewset, basename='ProductView')