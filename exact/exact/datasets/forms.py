from django import forms
from django.core.exceptions import ValidationError
from django.utils.translation import ugettext_lazy as _

from exact.users.models import User, Team
from exact.images.models import ImageSet

class DatasetForm(forms.Form):

    name = forms.CharField(help_text="Please enter a unique dataset name")
    team = forms.ModelChoiceField(queryset=None)
    proxy = forms.GenericIPAddressField(required=False)

    def __init__(self, *args, **kwargs):
        user = kwargs.pop('user', None)
        super().__init__(*args, **kwargs)

        self.fields['team'].queryset = Team.objects.filter(members=user)

    def is_valid(self):

        data = self.data['name']
        team = self.data['team']

        image_set = ImageSet.objects.filter(name=data, team=team).first()

        if image_set is not None:
             raise ValidationError(_('Name team combination is already in use'))

        return True

