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

class MITOS_WSI_CMCDatasetForm(DatasetForm):

    FILE_CHOICES = (('https://ndownloader.figshare.com/files/22407414?private_link=be072bf30fd3f63b03cc','deb768e5efb9d1dcbc13'),
               ('https://ndownloader.figshare.com/files/22585835?private_link=be072bf30fd3f63b03cc','d37ab62158945f22deed'),
               ('https://ndownloader.figshare.com/files/22407537?private_link=be072bf30fd3f63b03cc','022857018aa597374b6c'),
               ('https://ndownloader.figshare.com/files/22407411?private_link=be072bf30fd3f63b03cc','69a02453620ade0edefd'),
               ('https://ndownloader.figshare.com/files/22407540?private_link=be072bf30fd3f63b03cc','a8773be388e12df89edd'),
               ('https://ndownloader.figshare.com/files/22407552?private_link=be072bf30fd3f63b03cc','c4b95da36e32993289cb'),
               ('https://ndownloader.figshare.com/files/22407585?private_link=be072bf30fd3f63b03cc','3d3d04eca056556b0b26'),
               ('https://ndownloader.figshare.com/files/22407624?private_link=be072bf30fd3f63b03cc','d0423ef9a648bb66a763'),
               ('https://ndownloader.figshare.com/files/22407531?private_link=be072bf30fd3f63b03cc','50cf88e9a33df0c0c8f9'),
               ('https://ndownloader.figshare.com/files/22407486?private_link=be072bf30fd3f63b03cc','084383c18b9060880e82'),
               ('https://ndownloader.figshare.com/files/22407528?private_link=be072bf30fd3f63b03cc','4eee7b944ad5e46c60ce'),
               ('https://ndownloader.figshare.com/files/22407525?private_link=be072bf30fd3f63b03cc','2191a7aa287ce1d5dbc0'),
               ('https://ndownloader.figshare.com/files/22407519?private_link=be072bf30fd3f63b03cc','13528f1921d4f1f15511'),
               ('https://ndownloader.figshare.com/files/22407522?private_link=be072bf30fd3f63b03cc','2d56d1902ca533a5b509'),
               ('https://ndownloader.figshare.com/files/22407447?private_link=be072bf30fd3f63b03cc','460906c0b1fe17ea5354'),
               ('https://ndownloader.figshare.com/files/22407453?private_link=be072bf30fd3f63b03cc','da18e7b9846e9d38034c'),
               ('https://ndownloader.figshare.com/files/22407456?private_link=be072bf30fd3f63b03cc','72c93e042d0171a61012'),
               ('https://ndownloader.figshare.com/files/22407423?private_link=be072bf30fd3f63b03cc','b1bdee8e5e3372174619'),
               ('https://ndownloader.figshare.com/files/22407459?private_link=be072bf30fd3f63b03cc','fa4959e484beec77543b'),
               ('https://ndownloader.figshare.com/files/22407465?private_link=be072bf30fd3f63b03cc','e09512d530d933e436d5'),
               ('https://ndownloader.figshare.com/files/22407477?private_link=be072bf30fd3f63b03cc','d7a8af121d7d4f3fbf01'),
               )

    DATABASES  = (('MEL','MEL'),
               #('CODAEL','CODAEL'),
               #('ODAEL','ODAEL'),
               )

    files = forms.MultipleChoiceField(choices=FILE_CHOICES)
    database = forms.ChoiceField(choices=DATABASES)

