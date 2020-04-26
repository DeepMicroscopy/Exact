from django.template.response import TemplateResponse
from rest_framework.settings import api_settings
from django.core.paginator import Paginator
from rest_framework import viewsets, permissions

from . import models
from . import serializers

class ProductViewset(viewsets.ModelViewSet):
    permission_classes = [permissions.DjangoModelPermissions]
    serializer_class = serializers.ProductSerializer 
    filterset_fields = {
       'id': ['exact'],
       'name': ['exact' , 'contains'],
       'description': ['exact', 'contains'],
       'team': ['exact'],
       'creator': ['exact'],
       'imagesets': ['exact'],
       'annotationtype': ['exact'], 
   }

    def get_queryset(self):
        user = self.request.user
        return  models.Product.objects.filter(team__in=user.team_set.all()).select_related('creator', 'team')


    def create(self, request):
        user = self.request.user
        if "creator" not in request.data:
            request.data["creator"] = user.id
        response = super().create(request)
        return response

    def list(self, request, *args, **kwargs):
        if "api" in request.META['PATH_INFO']:
            return super(ProductViewset, self).list(request, *args, **kwargs)
        else:
            products = self.filter_queryset(self.get_queryset()).order_by('team')

            query = request.GET.get('query')
            get_query = ''
            paginator = Paginator(products, api_settings.PAGE_SIZE)
            page = request.GET.get('page')
            page = paginator.get_page(page)

            return TemplateResponse(request, 'base/explore.html', {
                'mode': 'products',
                'products': page,  # to separate what kind of stuff is displayed in the view
                'paginator': page,  # for page stuff
                'get_query': get_query,
                'query': query,
                #'filter': self.filterset_class
            })