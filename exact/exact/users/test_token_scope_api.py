import os
import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from exact.administration.models import Product
from exact.annotations.models import Annotation, AnnotationType
from exact.images.models import Image, ImageSet
from exact.users.models import PersonalAccessToken, Team, TeamMembership, User
from exact.users.tokens import generate_pat, hash_token


class TokenScopeApiTest(TestCase):
    """A read-only token that is restricted to one team ("muromi") must work for that team and nothing else."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        override = override_settings(IMAGE_PATH=tmp.name)
        override.enable()
        self.addCleanup(override.disable)

        self.user = User.objects.create_user("u", "u@example.com", "pw")
        self.muromi = Team.objects.create(name="muromi")
        self.other = Team.objects.create(name="other")
        for team in (self.muromi, self.other):
            TeamMembership.objects.create(team=team, user=self.user, is_admin=True)

        self.data = {}
        for team in (self.muromi, self.other):
            image_set = ImageSet.objects.create(name="set-" + team.name, team=team, creator=self.user)
            image_set.create_folder()
            product = Product.objects.create(name="p-" + team.name, team=team)
            product.imagesets.add(image_set)
            atype = AnnotationType.objects.create(name="t-" + team.name, product=product)
            image = Image.objects.create(name="i.png", filename="i.png", image_set=image_set)
            with open(os.path.join(image_set.root_path(), "i.png"), "wb") as f:
                f.write(b"png-" + team.name.encode())
            Annotation.objects.create(image=image, annotation_type=atype, user=self.user,
                                      vector={"x1": 1, "y1": 1, "x2": 9, "y2": 9})
            self.data[team.name] = {"set": image_set, "image": image, "type": atype}

    def client_for(self, read_only=True, teams=()):
        token, prefix = generate_pat()
        pat = PersonalAccessToken.objects.create(user=self.user, name="t", prefix=prefix,
                                                 token_hash=hash_token(token), read_only=read_only)
        pat.teams.set(teams)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
        return client

    def ids(self, client, url):
        r = client.get(url)
        self.assertEqual(r.status_code, 200, (url, r.content[:200]))
        return sorted(item["id"] for item in r.data["results"])

    def test_viewsets_only_show_the_token_team(self):
        c = self.client_for(teams=[self.muromi])
        m, o = self.data["muromi"], self.data["other"]
        self.assertEqual(self.ids(c, "/api/v1/images/image_sets/"), [m["set"].id])
        self.assertEqual(self.ids(c, "/api/v1/images/images/"), [m["image"].id])
        self.assertEqual(self.ids(c, "/api/v1/annotations/annotations/"),
                         [m["image"].annotations.get().id])
        self.assertEqual(self.ids(c, "/api/v1/annotations/annotation_types/"), [m["type"].id])
        self.assertEqual(self.ids(c, "/api/v1/users/teams/"), [self.muromi.id])
        self.assertEqual(self.ids(c, "/api/v1/administration/products/"), [m["type"].product_id])
        self.assertEqual(c.get(f"/api/v1/images/images/{o['image'].id}/").status_code, 404)

    def test_unrestricted_token_sees_everything(self):
        c = self.client_for(teams=[])
        self.assertEqual(len(self.ids(c, "/api/v1/images/image_sets/")), 2)
        self.assertEqual(len(self.ids(c, "/api/v1/images/images/")), 2)

    def test_download_follows_the_team_restriction(self):
        c = self.client_for(teams=[self.muromi])
        r = c.get(f"/images/api/image/download/{self.data['muromi']['image'].id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b"".join(r.streaming_content), b"png-muromi")
        r = c.get(f"/images/api/image/download/{self.data['other']['image'].id}/")
        self.assertEqual(r.status_code, 403)

    def test_get_endpoints_that_change_data_are_refused_for_read_only_tokens(self):
        c = self.client_for(read_only=True, teams=[self.muromi])
        image = self.data["muromi"]["image"]
        r = c.get(f"/images/api/image/delete/{image.id}/")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(Image.objects.filter(id=image.id).exists())
        self.assertTrue(os.path.exists(image.path()))

    def test_delete_via_get_stays_inside_the_team_for_writable_tokens(self):
        c = self.client_for(read_only=False, teams=[self.muromi])
        other = self.data["other"]["image"]
        self.assertEqual(c.get(f"/images/api/image/delete/{other.id}/").status_code, 403)
        self.assertTrue(Image.objects.filter(id=other.id).exists())

    def test_read_only_token_cannot_write_anywhere(self):
        c = self.client_for(read_only=True, teams=[self.muromi])
        m = self.data["muromi"]
        for method, url in [("post", "/api/v1/images/image_sets/"),
                            ("patch", f"/api/v1/images/image_sets/{m['set'].id}/"),
                            ("delete", f"/api/v1/images/images/{m['image'].id}/"),
                            ("post", f"/images/api/image/move/{m['image'].id}/{m['set'].id}/")]:
            self.assertEqual(getattr(c, method)(url, {}, format="json").status_code, 403, (method, url))

    def test_annotation_loading_follows_the_team_restriction(self):
        c = self.client_for(teams=[self.muromi])
        r = c.get("/annotations/api/annotation/load/", {"image_id": self.data["muromi"]["image"].id})
        self.assertEqual(r.status_code, 200, r.content[:200])
        r = c.get("/annotations/api/annotation/load/", {"image_id": self.data["other"]["image"].id})
        self.assertEqual(r.status_code, 403)

    def make_real_png(self, team):
        from PIL import Image as PILImage
        image = self.data[team]["image"]
        PILImage.new("RGB", (64, 64), (200, 30, 30)).save(image.path(), format="PNG")
        image.width = image.height = 64
        image.save()
        return image

    def test_centered_snapshot_accepts_tokens(self):
        image = self.make_real_png("muromi")
        other = self.make_real_png("other")
        url = lambda i: f"/images/image/centered_snapshot/{i.id}/32/32/16/16/"

        # a token restricted to the team, even if the client only accepts png
        c = self.client_for(read_only=True, teams=[self.muromi])
        r = c.get(url(image), HTTP_ACCEPT="image/png")
        self.assertEqual(r.status_code, 200, r.content[:200])
        self.assertEqual(r["Content-Type"], "image/PNG")
        self.assertTrue(r.content.startswith(b"\x89PNG"))
        self.assertEqual(c.get(url(other)).status_code, 403)

        # session users (the registration check page uses the url in <img> tags) keep working
        s = APIClient()
        s.force_authenticate(self.user)
        self.assertEqual(s.get(url(image)).status_code, 200)

        # anonymous requests are refused
        self.assertIn(APIClient().get(url(image)).status_code, (401, 403))
