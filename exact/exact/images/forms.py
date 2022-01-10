from django import forms

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

