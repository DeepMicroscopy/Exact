# Create your tests here.
import json
import time
import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from exact.administration.models import Product

from exact.images.models import ImageSet, Image
from exact.users.models import Team, TeamMembership

from exact.annotations.models import Annotation, AnnotationType
from exact.annotations.serializers import AnnotationSerializer


class AnnotationCreationTestCase(APITestCase):

    def setUp(self):

        self.bluk_test_count = 1000

        self.team = Team.objects.create(name='test_annotation')
        self.user = get_user_model().objects.create_user(
            username='foo', email='12@13', password='foobar123', team=self.team, is_superuser=True, is_staff=True, is_active=True, )

        self.client.login(username=self.user.username, password="foobar123")

        self.image_set = ImageSet.objects.create(name='foo',  team=self.team)
        self.image = Image.objects.create(name="123.svg", image_set=self.image_set)


        self.product = Product.objects.create(name="test_annotation", team = self.team)
        self.product.imagesets.add(self.image_set)
        self.product.save()

        self.annotation_type = AnnotationType.objects.create(name="test_annotation", vector_type=1, product=self.product)

    def test_create_annotations(self):
        
        t0 = time.time()

        data = {"image": self.image.id, "vector": {"x1":10, "x2": 10, "y1":20, "y2":20}, "annotation_type":self.annotation_type.id}

        response = self.client.post("/api/v1/annotations/annotations/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        t1 = time.time()
        print("{}: {}".format("test_create_annotations", t1-t0))

    def test_create_annotations_list(self):
        
        t0 = time.time()

        for i in range(self.bluk_test_count):
            data = {"image": self.image.id, "vector": {"x1":i, "x2": 10, "y1":20, "y2":20}, "annotation_type":self.annotation_type.id}

            response = self.client.post("/api/v1/annotations/annotations/?fields=unique_identifier,id", data, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        t1 = time.time()
        print("{}: {}".format("test_create_annotations_list", t1-t0))

    def test_create_annotations_bluk(self):
        
        data = [{"image": self.image.id, 
                "vector": {"x1":i, "x2": 10, "y1":20, "y2":20}, 
                "annotation_type":self.annotation_type.id, 
                "unique_identifier": str(uuid.uuid4())}
                for i in range(self.bluk_test_count)]

        uuid_list = list(set([d["unique_identifier"] for d in data]))

        t0 = time.time()
        response = self.client.post("/api/v1/annotations/annotations/?fields=unique_identifier,id", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        t1 = time.time()

        for item in response.data:
            if item["unique_identifier"] not in uuid_list:
                self.assertEqual(True, False, "UUID change at server!")
        print("{}: {}".format("test_create_annotations_bluk", t1-t0))