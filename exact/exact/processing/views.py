from django.http import HttpResponseForbidden, HttpResponse, HttpResponseBadRequest, JsonResponse, \
    FileResponse, HttpRequest
from django.template.response import TemplateResponse
from django.conf import settings

from .models import PluginJob, Plugin
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
    
    return index(request)


from django.core.paginator import Paginator

def index(request):

    current_jobs_user = PluginJob.objects.filter(Q(creator=request.user)).order_by('-created_time')
    current_jobs = PluginJob.objects.order_by('-updated_time')


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
            'incomplete_jobs' : incomplete_jobs[1:-1],
            'page_obj': P.get_page(page_number),
            'user_id': request.user.id,
        })

def detail(request, job_id):
    response = "You're looking at the results of question %s."
    return HttpResponse(response % job_id)
