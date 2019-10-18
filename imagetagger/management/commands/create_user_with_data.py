from django.core.management.base import BaseCommand

from imagetagger.annotations.models import AnnotationType, Annotation, Verification
from imagetagger.users.models import User, Team
from imagetagger.images import ImageSet, Image, SetTag


class Command(BaseCommand):
    def add_arguments(self, parser):
        # Positional arguments
        parser.add_argument("user_name", type=str, help="New User Name")

    def _create_AnnotationTypes(self, *args):

        user_name = args.user_name

        annotations = [
            # EIPH
            {"name": "0", "color_code": "#FFFF00", "vector_type": 1},
            {"name": "1", "color_code": "#0000FF", "vector_type": 1},
            {"name": "2", "color_code": "#FF00FF", "vector_type": 1},
            {"name": "3", "color_code": "#FF0000", "vector_type": 1},
            {"name": "4", "color_code": "#808000", "vector_type": 1},

            #Astma
            {"name": "macrophages", "color_code": "#FFFF00", "vector_type": 1},
            {"name": "lymphocytes", "color_code": "#0000FF", "vector_type": 1},
            {"name": "neutrophils", "color_code": "#FF00FF", "vector_type": 1},
            {"name": "eosinophils", "color_code": "#FF0000", "vector_type": 1},
            {"name": "mast_cells", "color_code": "#808000", "vector_type": 1},

            #Mitosen
            {"name": "mitosis", "color_code": "#F9FF33", "vector_type": 1},

            #Test
            {"name": "blumb", "color_code": "#F9FF33", "vector_type": 1},
        ]

        # write annotations to database
        for annotation in annotations:
            anno = AnnotationType.objects.get(name=annotation["name"])
            if anno:
                anno = AnnotationType(name=annotation["name"], vector_type=annotation["vector_type"],
                                      color_code=annotation["color_code"] )
                anno.save()

            tag = SetTag.objects.get(name=annotation["name"])
            if tag:
                # write tags to database
                tag = SetTag(name=annotation["name"])
                tag.save()


    def handle(self, *args, **options):
        self._create_AnnotationTypes(args)

