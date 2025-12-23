from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import UserPreferences  # your prefs model

User = get_user_model()

@receiver(post_save, sender=User)
def ensure_user_preferences(sender, instance, created, **kwargs):
    if created:
        UserPreferences.objects.get_or_create(user=instance)
        