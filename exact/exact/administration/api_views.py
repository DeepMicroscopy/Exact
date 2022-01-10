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
        return  models.Product.objects.filter(team__in=user.team_set.all()).select_related('creator', 'team').order_by('id')


    def create(self, request):
        user = self.request.user
        if "creator" not in request.data:
            request.data["creator"] = user.id
        if "imagesets" not in request.data:
            request.data["imagesets"] = []
        response = super().create(request)
        return response

    def list(self, request, *args, **kwargs):
        if "api" in request.META['PATH_INFO']:
            return super(ProductViewset, self).list(request, *args, **kwargs)
        else:
            products = self.filter_queryset(self.get_queryset()).order_by('team', 'id')
            
            current_query = request.META['QUERY_STRING']
            if "page" not in request.query_params:
                current_query += "&page=1"
                page_id = 1
            else:
                page_id = int(request.query_params.get('page', 1))            
            limit = int(request.query_params.get('limit', api_settings.PAGE_SIZE))

            paginator = Paginator(products, limit)
            page = paginator.get_page(page_id)


            previous_query = first_query = current_query.replace("&page="+str(page_id), "&page=1")
            if page.has_previous():
                previous_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.previous_page_number()))
            
            next_query = last_query = current_query.replace("&page="+str(page_id), "&page={}".format(paginator.num_pages))
            if page.has_next():
                next_query = current_query.replace("&page="+str(page_id), "&page={}".format(page.next_page_number()))


            return TemplateResponse(request, 'base/explore.html', {
                'mode': 'products',
                'products': page,  # to separate what kind of stuff is displayed in the view
                'paginator': page,  # for page stuff
                'first_query': first_query,
                'previous_query': previous_query,
                'next_query': next_query,
                'last_query': last_query,
                #'filter': self.filterset_class
            })