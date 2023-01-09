from django import forms
from django_registration.forms import RegistrationForm

from .models import Team, UI_User, User


class UserRegistrationForm(RegistrationForm):
    class Meta:
        model = User
        fields = [
            'username',
            'email',
            'password1',
            'password2',
        ]

class UserEditForm(forms.ModelForm):
    class Meta:
        model = User
        fields = [
            'first_name',
            'last_name',
            'email',
            'password',
        ]

class UIUserEditForm(forms.ModelForm):
    class Meta:
        model = UI_User
        fields = [
            'frontend',
        ]


class TeamCreationForm(forms.ModelForm):
    class Meta:
        model = Team
        fields = [
            'name',
        ]
