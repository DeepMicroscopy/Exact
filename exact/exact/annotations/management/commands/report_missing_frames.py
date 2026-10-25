from django.core.management import BaseCommand
from django.db.models import Count, Q

from exact.annotations.models import Annotation, AnnotationType


class Command(BaseCommand):
    help = ('Lists annotations on z-stack / multi-frame images that have no frame in their vector. '
            'The viewer only shows such annotations on no frame at all (see the frame bug fixed in exact-image-viewer.js). '
            'The command only reports, it does not change anything.')

    def add_arguments(self, parser):
        parser.add_argument('--image-set', type=int, action='append', dest='image_sets',
                            help='Only check this image set (id). Can be given several times.')
        parser.add_argument('--ids', action='store_true',
                            help='Also print the ids of the affected annotations.')
        parser.add_argument('--include-multi-frame-types', action='store_true',
                            help='Also report annotations of "multi frame" annotation types. '
                                 'These are shown on every frame, so they are not hidden by the missing frame.')

    def handle(self, *args, **options):
        annotations = Annotation.objects.filter(deleted=False, vector__isnull=False) \
            .filter(Q(image__frames__gt=1) | Q(image__depth__gt=1)) \
            .exclude(annotation_type__vector_type__in=[AnnotationType.VECTOR_TYPE.GLOBAL,
                                                       AnnotationType.VECTOR_TYPE.SEGMENTATION]) \
            .exclude(vector__has_key='frame')
        if not options['include_multi_frame_types']:
            annotations = annotations.exclude(annotation_type__multi_frame=True)
        if options['image_sets']:
            annotations = annotations.filter(image__image_set_id__in=options['image_sets'])

        rows = annotations.values('image__image_set_id', 'image__image_set__name', 'image_id', 'image__name') \
            .annotate(count=Count('id')).order_by('image__image_set_id', 'image__name')

        total = 0
        current_set = None
        for row in rows:
            if row['image__image_set_id'] != current_set:
                current_set = row['image__image_set_id']
                self.stdout.write(self.style.MIGRATE_HEADING(
                    'Image set {} "{}"'.format(current_set, row['image__image_set__name'])))
            total += row['count']
            self.stdout.write('  image {:>6}  {:<50}  {:>5} annotations without frame'.format(
                row['image_id'], row['image__name'][:50], row['count']))
            if options['ids']:
                ids = annotations.filter(image_id=row['image_id']).order_by('id').values_list('id', flat=True)
                self.stdout.write('      ids: ' + ', '.join(str(i) for i in ids))

        if total == 0:
            self.stdout.write(self.style.SUCCESS('No annotations without frame found.'))
        else:
            self.stdout.write(self.style.WARNING(
                '{} annotations without frame. They are not shown in the viewer until a frame is set '
                '(e.g. via the API: PATCH the annotation with vector.frame).'.format(total)))
