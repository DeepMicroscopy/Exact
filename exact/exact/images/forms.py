from django import forms
from django.db.models import Q

from exact.images.models import ImageSet


class ImageSetCreationForm(forms.ModelForm):
    class Meta:
        model = ImageSet
        fields = [
            'name',
            'location',
            'public',
            'public_collaboration',
            'show_registration'
        ]


class ImageSetCreationFormWT(forms.ModelForm):
    class Meta:
        model = ImageSet
        fields = [
            'name',
            'location',
            'public',
            'public_collaboration',
            'team',
            'show_registration'
        ]


class ImageSetEditForm(forms.ModelForm):
    class Meta:
        model = ImageSet
        fields = [
            'name',
            'location',
            'description',
            'public',
            'public_collaboration',
            'image_lock',
            'priority',
            'collaboration_type',
            'main_annotation_type',
            'show_registration'
        ]


class LabelUploadForm(forms.Form):
    file = forms.FileField()
    verify = forms.BooleanField(required=None)


class CopyImageSetForm(forms.Form):

    imagesets = forms.ModelMultipleChoiceField(
                       widget = forms.CheckboxSelectMultiple,
                       queryset = ImageSet.objects.all()
               )

    copy_annotations = forms.BooleanField(required=None)


# Form to select images for copying
class CopyImageSelectionForm(forms.Form):
    """ A dynamic Django form to select individual images from multiple accessible ImageSets
    for the purpose of copying them into another target ImageSet."""
    copy_annotations = forms.BooleanField(required=False, label="Copy Annotations")

    def __init__(self, *args, **kwargs):
        user = kwargs.pop("user")
        super().__init__(*args, **kwargs)

        self.image_sets = ImageSet.objects.filter(
            Q(team__in=user.team_set.all()) | Q(public=True)
        ).prefetch_related("images")

        self.image_fields = []
        for imageset in self.image_sets:
            field_name = f"imageset_{imageset.id}"
            field = forms.ModelMultipleChoiceField(
                label=imageset.name,
                queryset=imageset.images.all(),
                required=False,
                widget=forms.CheckboxSelectMultiple,
            )
            self.fields[field_name] = field
            self.image_fields.append((imageset, self[field_name]))