from django.http import HttpResponseForbidden, HttpResponse, HttpResponseBadRequest, JsonResponse, \
    FileResponse, HttpRequest
from django.template.response import TemplateResponse
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.exceptions import ParseError
from rest_framework.response import Response
from rest_framework.status import HTTP_201_CREATED, HTTP_400_BAD_REQUEST, HTTP_200_OK, \
    HTTP_403_FORBIDDEN

from .serializers import PluginJobSerializer
from .models import PluginJob, Plugin, PluginResult
from exact.images.models import Image, ImageSet
from django.db.models import Q
from django.shortcuts import get_object_or_404,redirect
from django.urls import reverse
import json
from django.views.generic import ListView

def submit(request, plugin_id, image_id):
    image = get_object_or_404(Image, id=image_id)
    plugin = get_object_or_404(Plugin, id=plugin_id)

    if (PluginJob.objects.filter(image=image).filter(plugin=plugin).count()==0):
        pluginJob = PluginJob.objects.create(
                image=image,
                plugin=plugin,
                creator=request.user)

    return redirect(reverse('annotations:annotate', args=(image.id,)))


@api_view(['POST'])
def create_job(request) -> Response:
    try:
        image_id = int(request.data['image_id'])
        plugin_id = int(request.data['plugin_id'])
    except (KeyError, TypeError, ValueError):
        raise ParseError

    image = get_object_or_404(Image, pk=image_id)
    plugin = get_object_or_404(Plugin, pk=plugin_id)

    if (PluginJob.objects.filter(image=image).filter(plugin=plugin).count()==0):
        pluginJob = PluginJob.objects.create(
                image=image,
                plugin=plugin,
                creator=request.user)
        serializer = PluginJobSerializer(pluginJob)
        return Response(serializer.data, status=HTTP_201_CREATED)
    return Response([], status=HTTP_400_BAD_REQUEST)

def submit_imageset(request, plugin_id, imageset_id):
    imageset = get_object_or_404(ImageSet, id=imageset_id)
    plugin = get_object_or_404(Plugin, id=plugin_id)

    for image in imageset.images.all():
        if (PluginJob.objects.filter(image=image).filter(plugin=plugin).count()==0):
            pluginJob = PluginJob.objects.create(
                    image=image,
                    plugin=plugin,
                    creator=request.user)

    return index(request)


def stop(request, job_id):
    job = get_object_or_404(PluginJob, id=job_id)

    if (job.creator != request.user):
        return HttpResponse('Error: Job is owned by another user.')
    
    job.delete()

    # Also delete all dependent objects
    results = PluginResult.objects.filter(job=job_id).delete()
    
    return index(request)


from django.core.paginator import Paginator

def index(request):

    current_jobs_user = PluginJob.objects.filter(Q(creator=request.user)).order_by('-created_time')
    current_jobs = PluginJob.objects.order_by('-updated_time')

    if ('completed' not in request.GET) or (int(request.GET['completed'])==0):
        current_jobs_user = current_jobs_user.filter(~Q(processing_complete=100))
        completed=0
    else:
        completed=1

    P = Paginator(current_jobs_user, settings.PAGINATION_PROCESSING_QUEUE)
    page_number = request.GET.get('page')

    incomplete_jobs=[]
    for job in P.get_page(page_number).object_list:
        if (job.processing_complete<100) or (job.attached_worker and len(job.attached_worker)>0):
            incomplete_jobs.append(job.id)

    incomplete_jobs = json.dumps(incomplete_jobs)


    return TemplateResponse(request, 'processing/index.html', {
            'current_jobs' : current_jobs,
            'current_jobs_user' : P.get_page(page_number).object_list,
            'user': request.user,
            'include_completed' : completed,
            'incomplete_jobs' : incomplete_jobs[1:-1],
            'page_obj': P.get_page(page_number),
            'user_id': request.user.id,
        })

def detail(request, job_id):
    response = "You're looking at the results of question %s."
    return HttpResponse(response % job_id)
