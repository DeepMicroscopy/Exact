# app/authentication.py
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework import exceptions
import secrets

from .models import PersonalAccessToken
from .tokens import hash_token

class PersonalAccessTokenAuthentication(BaseAuthentication):
    keyword = b"bearer"

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth:
            return None

        if auth[0].lower() != self.keyword:
            return None

        if len(auth) != 2:
            raise exceptions.AuthenticationFailed("Invalid Authorization header format.")

        token = auth[1].decode("utf-8")

        # Expecting format: pat_<prefix>.<secret>
        if not token.startswith("pat_") or "." not in token:
            raise exceptions.AuthenticationFailed("Invalid token format.")

        try:
            prefix_part = token.split(".", 1)[0]          # pat_<prefix>
            prefix = prefix_part.replace("pat_", "", 1)
        except Exception:
            raise exceptions.AuthenticationFailed("Invalid token format.")

        # Lookup by prefix, then verify hash
        candidate_qs = PersonalAccessToken.objects.select_related("user").filter(prefix=prefix)
        if not candidate_qs.exists():
            raise exceptions.AuthenticationFailed("Invalid token.")

        token_h = hash_token(token)

        # Usually one row per prefix; if you allow collisions, iterate
        pat = None
        for row in candidate_qs:
            if secrets.compare_digest(row.token_hash, token_h):
                pat = row
                break

        if pat is None:
            raise exceptions.AuthenticationFailed("Invalid token.")

        if not pat.is_active:
            raise exceptions.AuthenticationFailed("Token expired or revoked.")

        # Optional: update last_used_at
        PersonalAccessToken.objects.filter(pk=pat.pk).update(last_used_at=timezone.now())

        return (pat.user, pat)