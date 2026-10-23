"""Moving an image (database row and files on disk) to another image set."""
import logging
import os
import shutil
from pathlib import Path

from django.core.cache import cache
from django.db import transaction
from django.db.models import Q

from exact.annotations.models import AnnotationType

from .models import Image, ImageSet

logger = logging.getLogger(__name__)


class MoveNotAllowed(Exception):
    """The image can not be moved; `status` is the HTTP status that describes why."""

    def __init__(self, message, status=409):
        super().__init__(message)
        self.status = status


def associated_file_names(image: Image):
    """
    Names (relative to the folder of the image set) of all files and folders that belong to the image:
    the original, the (converted) image file, the thumbnail and the folder used for z-stacks/frames and MRXS.
    """
    root = image.image_set.root_path()
    candidates = [image.name, image.filename]
    for name in (image.name, image.filename):
        candidates.append(Path(name).stem + Image.thumbnail_extension)
    candidates.append(Path(image.thumbnail_path()).name)
    for name in (image.name, image.filename):
        stem = Path(name).stem
        # z-stacks / frames are stored in a folder named like the image, as are MRXS data folders
        if os.path.isdir(os.path.join(root, stem)) and (
                image.depth > 1 or image.frames > 1 or name.lower().endswith('.mrxs')):
            candidates.append(stem)

    names = []
    for name in candidates:
        if name and name not in names and os.path.lexists(os.path.join(root, name)):
            names.append(name)
    return names


def check_move_allowed(image: Image, target: ImageSet, user):
    """Raises MoveNotAllowed if the user may not move the image to the target image set."""
    source = image.image_set

    if source.id == target.id:
        raise MoveNotAllowed('The image is already in this image set.', 400)
    if image.image_type == Image.ImageSourceTypes.SERVER_GENERATED:
        raise MoveNotAllowed('Server generated images can not be moved.', 400)
    if not source.has_perm('delete_images', user) or source.image_lock:
        raise MoveNotAllowed('You are not allowed to remove images from the source image set.', 403)
    if not target.has_perm('edit_set', user) or target.image_lock:
        raise MoveNotAllowed('You are not allowed to add images to the target image set.', 403)

    if target.images.filter(Q(name=image.name) | Q(filename=image.filename)).exists():
        raise MoveNotAllowed('The target image set already contains an image with this name.')

    # annotations keep their annotation type, so the target image set has to offer all used types
    used_types = AnnotationType.objects.filter(annotation__image=image, annotation__deleted=False).distinct()
    available = AnnotationType.objects.filter(product__imagesets=target)
    missing = list(used_types.exclude(id__in=available.values('id')).values_list('name', flat=True))
    if missing:
        raise MoveNotAllowed('The target image set does not have the annotation types used in this image: '
                             + ', '.join(missing))

    target_root = target.root_path()
    for name in associated_file_names(image):
        if os.path.lexists(os.path.join(target_root, name)):
            raise MoveNotAllowed('A file named "{}" already exists in the target image set.'.format(name))


def _linked_copies(image: Image, names):
    """Symlinks of copies of this image in other image sets that point to the files that are moved."""
    source_root = image.image_set.root_path()
    real_paths = {os.path.realpath(os.path.join(source_root, n)) for n in names}
    links = []
    for other in Image.objects.filter(Q(filename=image.filename) | Q(name=image.name)) \
            .exclude(id=image.id).select_related('image_set'):
        link = os.path.join(other.image_set.root_path(), other.filename)
        if os.path.islink(link) and os.path.realpath(link) in real_paths:
            links.append((link, os.path.basename(os.path.realpath(link))))
    return links


def move_image(image: Image, target: ImageSet, user):
    """Moves the image including all files and annotations to the target image set."""
    check_move_allowed(image, target, user)

    source = image.image_set
    names = associated_file_names(image)
    links = _linked_copies(image, names)
    old_set_id = source.id

    moved = []
    try:
        os.makedirs(target.root_path(), exist_ok=True)
        for name in names:
            src = os.path.join(source.root_path(), name)
            dst = os.path.join(target.root_path(), name)
            shutil.move(src, dst)
            moved.append((src, dst))

        with transaction.atomic():
            image.image_set = target
            image.save()
            for image_set in (source, target):
                image_set.zip_state = ImageSet.ZipState.INVALID
                image_set.save(update_fields=('zip_state',))
    except Exception:
        for src, dst in reversed(moved):
            try:
                shutil.move(dst, src)
            except Exception:
                logger.exception('Could not restore %s after a failed move of image %s', src, image.id)
        image.image_set = source
        raise

    # copies of this image in other image sets are symbolic links to the moved files
    for link, file_name in links:
        try:
            os.unlink(link)
            os.symlink(os.path.join(os.path.abspath(target.root_path()), file_name), link)
        except OSError:
            logger.exception('Could not update link %s after moving image %s', link, image.id)

    if hasattr(cache, "delete_pattern"):
        for set_id in (old_set_id, target.id):
            cache.delete_pattern(f"*/api/v1/images/image_sets/{set_id}/*")

    return image
