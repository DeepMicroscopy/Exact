import os
import tempfile
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from exact.administration.models import Product
from exact.annotations.models import Annotation, AnnotationType
from exact.images.models import Image, ImageSet
from exact.users.models import Team, TeamMembership, User


class MoveImageTest(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.settings_override = override_settings(IMAGE_PATH=self.tmp.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

        self.user = User.objects.create_user("admin", "a@example.com", "pw")
        self.team = Team.objects.create(name="t")
        TeamMembership.objects.create(team=self.team, user=self.user, is_admin=True)
        self.src = self.make_set("src", self.team)
        self.dst = self.make_set("dst", self.team)

        self.product = Product.objects.create(name="p", team=self.team)
        self.product.imagesets.add(self.src, self.dst)
        self.atype = AnnotationType.objects.create(name="a", product=self.product)

        self.image = self.make_image(self.src, "slide.svs")
        Annotation.objects.create(image=self.image, annotation_type=self.atype, user=self.user,
                                  vector={"x1": 1, "y1": 1, "x2": 5, "y2": 5})

        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def make_set(self, name, team):
        image_set = ImageSet.objects.create(name=name, team=team, creator=self.user)
        image_set.create_folder()
        return image_set

    def make_image(self, image_set, name):
        image = Image.objects.create(name=name, filename=name, image_set=image_set)
        for file_name in (name, name.rsplit(".", 1)[0] + Image.thumbnail_extension):
            with open(os.path.join(image_set.root_path(), file_name), "w") as f:
                f.write(file_name)
        return image

    def move(self, image=None, target=None, client=None):
        image, target = image or self.image, target or self.dst
        return (client or self.client).post(f"/images/api/image/move/{image.id}/{target.id}/")

    def files(self, image_set):
        return sorted(os.listdir(image_set.root_path()))

    def test_move_moves_files_and_annotations(self):
        r = self.move()
        self.assertEqual(r.status_code, 200, r.content)
        self.image.refresh_from_db()
        self.assertEqual(self.image.image_set_id, self.dst.id)
        self.assertEqual(self.files(self.src), [])
        self.assertEqual(self.files(self.dst), ["slide.svs", "slide_thumbnail.png"])
        self.assertEqual(self.image.annotations.count(), 1)

    def test_name_conflict_changes_nothing(self):
        self.make_image(self.dst, "slide.svs")
        r = self.move()
        self.assertEqual(r.status_code, 409)
        self.image.refresh_from_db()
        self.assertEqual(self.image.image_set_id, self.src.id)
        self.assertEqual(self.files(self.src), ["slide.svs", "slide_thumbnail.png"])

    def test_file_conflict_in_target_changes_nothing(self):
        with open(os.path.join(self.dst.root_path(), "slide_thumbnail.png"), "w") as f:
            f.write("other")
        self.assertEqual(self.move().status_code, 409)
        self.assertEqual(self.files(self.src), ["slide.svs", "slide_thumbnail.png"])

    def test_missing_annotation_type_in_target(self):
        other_product = Product.objects.create(name="p2", team=self.team)
        target = self.make_set("other", self.team)
        other_product.imagesets.add(target)
        r = self.move(target=target)
        self.assertEqual(r.status_code, 409)
        self.assertIn("a", r.data["detail"])

    def test_same_image_set_rejected(self):
        self.assertEqual(self.move(target=self.src).status_code, 400)

    def test_locked_or_no_delete_permission(self):
        member = User.objects.create_user("member", "m@example.com", "pw")
        TeamMembership.objects.create(team=self.team, user=member, is_admin=False)
        c = APIClient(); c.force_authenticate(member)
        self.assertEqual(self.move(client=c).status_code, 403)  # members may not remove images

        self.dst.image_lock = True
        self.dst.save()
        self.assertEqual(self.move().status_code, 403)

    def test_foreign_team_image_set_not_visible(self):
        stranger_team = Team.objects.create(name="x")
        target = self.make_set("foreign", stranger_team)
        self.assertEqual(self.move(target=target).status_code, 404)

    def test_linked_copies_follow_the_moved_file(self):
        third = self.make_set("third", self.team)
        copy = Image.objects.create(name="slide.svs", filename="slide.svs", image_set=third)
        link = os.path.join(third.root_path(), "slide.svs")
        os.symlink(os.path.join(self.src.root_path(), "slide.svs"), link)

        self.assertEqual(self.move().status_code, 200)
        self.assertTrue(os.path.islink(link))
        self.assertEqual(os.path.realpath(link), os.path.realpath(os.path.join(self.dst.root_path(), "slide.svs")))
        self.assertTrue(os.path.exists(link))

    def test_failed_database_update_restores_files(self):
        with mock.patch.object(Image, "save", side_effect=RuntimeError("db down")):
            r = self.move()
        self.assertEqual(r.status_code, 500)
        self.assertEqual(self.files(self.src), ["slide.svs", "slide_thumbnail.png"])
        self.assertEqual(self.files(self.dst), [])
        self.image.refresh_from_db()
        self.assertEqual(self.image.image_set_id, self.src.id)

    def test_targets_endpoint_lists_unlocked_sets_of_own_teams(self):
        self.dst.image_lock = True
        self.dst.save()
        self.make_set("foreign", Team.objects.create(name="x"))
        names = [i["name"] for i in self.client.get("/images/api/image/move-targets/").data]
        self.assertEqual(names, ["src"])

    def test_read_only_token_cannot_move(self):
        from exact.users.models import PersonalAccessToken
        from exact.users.tokens import generate_pat, hash_token
        token, prefix = generate_pat()
        PersonalAccessToken.objects.create(user=self.user, name="ro", prefix=prefix,
                                           token_hash=hash_token(token), read_only=True)
        c = APIClient(); c.credentials(HTTP_AUTHORIZATION="Bearer " + token)
        self.assertEqual(self.move(client=c).status_code, 403)
        self.image.refresh_from_db()
        self.assertEqual(self.image.image_set_id, self.src.id)
