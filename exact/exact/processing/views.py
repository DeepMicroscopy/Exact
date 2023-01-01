from django.http import HttpResponseForbidden, HttpResponse, HttpResponseBadRequest, JsonResponse, \
    FileResponse, HttpRequest
from django.template.response import TemplateResponse

from .models import PluginJob
from django.db.models import Q
from django.shortcuts import get_object_or_404

def indexf(request):
    current_jobs = PluginJob.objects.order_by('-updated_time')[:5]
    output = ', '.join([q.__str__() for q in current_jobs])
    return HttpResponse(output)

def stop(request, job_id):
    job = get_object_or_404(PluginJob, id=job_id)

    if (job.creator != request.user):
        return HttpResponse('Error: Job is owned by another user.')
    
    job.delete()

#    creator==request.user
#    current_jobs_user = PluginJob.objects.filter(Q(creator=request.user)).order_by('-created_time')
    
    return index(request)

def index(request):
    current_jobs_user = PluginJob.objects.filter(Q(creator=request.user)).order_by('-created_time')
    current_jobs = PluginJob.objects.order_by('-updated_time')
    return TemplateResponse(request, 'processing/index.html', {
            'current_jobs' : current_jobs,
            'current_jobs_user' : current_jobs_user,
            'user': request.user,
        })

def detail(request, job_id):
    response = "You're looking at the results of question %s."
    return HttpResponse(response % job_id)
