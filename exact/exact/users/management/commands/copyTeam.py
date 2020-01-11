import os
from shutil import copyfile

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from exact.users.models import User, Team, TeamMembership
from exact.administration.models import Product
from exact.annotations.models import Annotation, Export, ExportFormat, \
    AnnotationType, Verification, LogImageAction
from exact.images.models import Image, ImageSet

class Command(BaseCommand):
    help = 'Clone a team with all its products, annotations and images'

    def add_arguments(self, parser):
        parser.add_argument('team_id', type=int)
        parser.add_argument('team_name', type=str)
        parser.add_argument('member_id', type=int)

    def handle(self, *args, **options):

        original_team = Team.objects.get(id=options['team_id'])
        admin_member = User.objects.get(id=options['member_id'])

        new_team = Team.objects.filter(name=options['team_name']).first()
        if  new_team is None:
            new_team = Team()
            new_team.name = options['team_name']
            new_team.save()

        team_membership = TeamMembership.objects.filter(team=new_team, user=admin_member).first()
        if team_membership is None:
            team_membership = TeamMembership()
            team_membership.is_admin = True
            team_membership.team = new_team
            team_membership.user = admin_member
            team_membership.save()

        annotation_type_new_ids = []
        for product in Product.objects.filter(team__id=original_team.id):
            temp_product_id = product.id
            new_product = Product.objects.filter(team__id=new_team.id, name=product.name).first()
            if new_product is None:
                product.id = None # create a new Product
                product.team = new_team
                product.save()
            else:
                for annotation_type in AnnotationType.objects.filter(product__id=new_product.id):
                    annotation_type_new_ids.append(annotation_type.id)
                continue

            for annotation_type in AnnotationType.objects.filter(product__id=temp_product_id):
                annotation_type.id = None # create a new annotation_type
                annotation_type.product = product
                annotation_type.save()

                annotation_type_new_ids.append(annotation_type.id)

        for imageset in ImageSet.objects.filter(team=original_team):
            new_imageset = ImageSet.objects.filter(team=new_team, name=imageset.name).first()
            temp_imageset_id = imageset.id
            original_imageset_path = imageset.root_path()

            if new_imageset is None:
                imageset.team = new_team
                imageset.id = None
                imageset.path = None
                imageset.save()

                original_main_annotation_type = AnnotationType.objects.filter(id=imageset.main_annotation_type_id).first()
                if original_main_annotation_type is not None:
                    new_main_annotation_type_id = AnnotationType.objects.get(id__in=annotation_type_new_ids, name=original_main_annotation_type.name)
                    imageset.main_annotation_type_id = new_main_annotation_type_id.id

                for original_product in ImageSet.objects.get(id=temp_imageset_id).product_set.all():
                    new_product = Product.objects.get(team=new_team, name=original_product.name)
                    imageset.product_set.add(new_product)

                imageset.path = '{}_{}_{}'.format(connection.settings_dict['NAME'], new_team.id,
                                                  imageset.id)
                imageset.save()
            else:
                imageset = new_imageset

            folder_path = imageset.root_path()
            if not os.path.exists(folder_path):
                os.makedirs(folder_path)

            for image in Image.objects.filter(image_set__id=temp_imageset_id):
                new_image = None
                if new_imageset is not None:
                    new_image = Image.objects.filter(image_set__id=new_imageset.id, name=image.name).first()
                if new_image is None:

                    # use symbolic link
                    os.symlink(original_imageset_path+"/"+image.filename, imageset.root_path() + "/" + image.filename)
                    #copyfile(original_imageset_path+"/"+image.filename, imageset.root_path() + "/" + image.filename)

                    image_original_id = image.id
                    image.id = None
                    image.image_set_id = imageset.id
                    image.save()

                    for anno in Annotation.objects.filter(image__id=image_original_id):
                        anno.image_id = image.id

                        original_annotation_type = AnnotationType.objects.get(id=anno.annotation_type_id)
                        anno.annotation_type = AnnotationType.objects.get(id__in=annotation_type_new_ids,
                                                                             name=original_annotation_type.name)

                        anno.id = None
                        anno.save()






















