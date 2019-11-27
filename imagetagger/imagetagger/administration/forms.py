from django import forms

from imagetagger.annotations.models import AnnotationType


class AnnotationTypeCreationForm(forms.ModelForm):
    class Meta:
        model = AnnotationType
        fields = [
            'name',
            'active',
            'node_count',
            'vector_type',
            'enable_concealed',
            'enable_blurred',
            'default_width',
            'default_height',
            'color_code',
            'sort_order'
        ]


class AnnotationTypeEditForm(forms.ModelForm):
    class Meta:
        model = AnnotationType
        fields = [
            'name',
            'active',
            'enable_concealed',
            'enable_blurred',
            'default_width',
            'default_height',
            'color_code',
            'sort_order'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
