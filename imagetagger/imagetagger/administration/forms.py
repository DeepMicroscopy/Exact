from django import forms

from imagetagger.administration.models import Product
from imagetagger.annotations.models import AnnotationType


class ProductCreationForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = [
            'name',
            'description',
            'team',
        ]

class ProductEditForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = [
            'name',
            'description',
            'team',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)



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
            'sort_order',
            'product',
            'closed',
            'area_hit_test'
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
            'sort_order',
            'image_file',
            'product',
            'closed',
            'area_hit_test'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
