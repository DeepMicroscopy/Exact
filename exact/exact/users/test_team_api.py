import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from exact.administration.models import Product
from exact.images.models import ImageSet
from exact.users.models import Team, TeamMembership, User


class TeamApiTest(TestCase):
    """The relations of a team (members, image sets, products, memberships) are read-only in the team API."""

    url = "/api/v1/users/teams/"

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        override = override_settings(IMAGE_PATH=tmp.name)
        override.enable()
        self.addCleanup(override.disable)

        self.user = User.objects.create_superuser("admin", "admin@example.com", "pw")
        self.team = Team.objects.create(name="team")
        self.membership = TeamMembership.objects.create(team=self.team, user=self.user, is_admin=True)
        self.image_set = ImageSet.objects.create(name="set", team=self.team, creator=self.user)
        self.product = Product.objects.create(name="product", team=self.team)

        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_create_with_name_only(self):
        r = self.client.post(self.url, {"name": "new team"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        team = Team.objects.get(name="new team")
        self.assertTrue(TeamMembership.objects.filter(team=team, user=self.user, is_admin=True).exists())

    def test_update_keeps_image_sets_and_products(self):
        r = self.client.put(f"{self.url}{self.team.id}/",
                            {"name": "renamed", "image_sets": [], "product_set": [], "memberships": []},
                            format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.team.refresh_from_db()
        self.image_set.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(self.team.name, "renamed")
        self.assertEqual(self.image_set.team_id, self.team.id)
        self.assertEqual(self.product.team_id, self.team.id)
        self.assertTrue(TeamMembership.objects.filter(id=self.membership.id, team=self.team).exists())

    def test_update_does_not_move_memberships_of_other_teams(self):
        other_user = User.objects.create_user("other", "other@example.com", "pw")
        other_team = Team.objects.create(name="other")
        foreign = TeamMembership.objects.create(team=other_team, user=other_user)

        r = self.client.patch(f"{self.url}{self.team.id}/", {"memberships": [foreign.id]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        foreign.refresh_from_db()
        self.assertEqual(foreign.team_id, other_team.id)

    def test_relations_are_still_returned(self):
        r = self.client.get(f"{self.url}{self.team.id}/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["members"], [self.user.id])
        self.assertEqual(r.data["image_sets"], [self.image_set.id])
        self.assertEqual(r.data["product_set"], [self.product.id])
        self.assertEqual(r.data["memberships"], [self.membership.id])
