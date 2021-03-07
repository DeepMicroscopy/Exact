from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from exact.images.models import ImageSet, Image
from exact.users.models import Team, TeamMembership
from pathlib import Path
import shutil

class ImageRegistrationTestCase(APITestCase):

    def setUp(self):

        self.team = Team.objects.create(name='test_annotation')
        self.user = get_user_model().objects.create_user(
            username='foo', email='12@13', password='foobar123', team=self.team, is_superuser=True, is_staff=True, is_active=True)
        
        self.client.login(username=self.user.username, password="foobar123")

        self.image_set = ImageSet.objects.create(name='foo',  team=self.team)
        self.image_set.create_folder()
        self.image_set.save()

        folder =  self.image_set.root_path()
        shutil.copy("doc/examples/images/A_CCMCT_22108_1.svs", Path(folder) / "A_CCMCT_22108_1.svs")
        shutil.copy("doc/examples/images/N2_CCMCT_22108_1.ndpi", Path(folder) / "N2_CCMCT_22108_1.ndpi")
        
        source_path = Path(Path(folder) / "A_CCMCT_22108_1.svs")
        target_path = Path(Path(folder) / "N2_CCMCT_22108_1.ndpi")

        self.source_image = Image.objects.create(name=source_path.name, image_set=self.image_set)
        self.source_image.save_file(source_path)
        self.target_image = Image.objects.create(name=target_path.name, image_set=self.image_set)
        self.target_image.save_file(target_path)

    def test_create_registration(self):

        data = {"source_image": self.source_image.id, "target_image": self.target_image.id}
        response = self.client.post("/api/v1/images/registration/", data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        print()


    def test_register_images(self):

        data = {"target_image": self.target_image.id, "target_depth": 0}
        response = self.client.post(f"/api/v1/images/images/{self.source_image.id}/register_images/", data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)