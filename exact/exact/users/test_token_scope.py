from rest_framework.test import APIClient
from django.test import TestCase

from exact.images.models import ImageSet
from exact.users.models import Team, User


class TokenScopeTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser("tokuser", "t@example.com", "pw")
        self.team = Team.objects.create(name="t")
        self.team.members.add(self.user)
        self.team_b = Team.objects.create(name="b")
        self.team_b.members.add(self.user)
        self.set_a = ImageSet.objects.create(name="a", team=self.team, creator=self.user)
        self.set_b = ImageSet.objects.create(name="b", team=self.team_b, creator=self.user)
        self.session = APIClient()
        self.session.force_authenticate(self.user)

    def make_token(self, **kw):
        r = self.session.post("/users/api/tokens/", kw, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["token"])
        return c

    def test_unrestricted(self):
        c = self.make_token(name="x")
        r = c.get("/api/v1/images/image_sets/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 2)

    def test_read_only(self):
        c = self.make_token(name="ro", read_only=True)
        self.assertEqual(c.get("/api/v1/images/image_sets/").status_code, 200)
        self.assertEqual(c.delete(f"/api/v1/images/image_sets/{self.set_a.id}/").status_code, 403)
        self.assertEqual(c.post("/users/api/tokens/", {"name": "n"}, format="json").status_code, 403)
        self.assertTrue(ImageSet.objects.filter(id=self.set_a.id).exists())

    def test_team_restriction(self):
        c = self.make_token(name="rs", teams=[self.team.id])
        r = c.get("/api/v1/images/image_sets/")
        self.assertEqual([i["id"] for i in r.data["results"]], [self.set_a.id])
        self.assertEqual(c.get(f"/api/v1/images/image_sets/{self.set_a.id}/").status_code, 200)
        self.assertEqual(c.get(f"/api/v1/images/image_sets/{self.set_b.id}/").status_code, 404)

    def test_cannot_scope_to_foreign_team(self):
        other = Team.objects.create(name="o")
        r = self.session.post("/users/api/tokens/", {"name": "n", "teams": [other.id]}, format="json")
        self.assertEqual(r.status_code, 400)
