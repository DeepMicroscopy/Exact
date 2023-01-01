from django.http import HttpResponseForbidden, HttpResponse, HttpResponseBadRequest, JsonResponse, \
    FileResponse, HttpRequest
from django.template.response import TemplateResponse

from .models import PluginJob

def indexf(request):
    current_jobs = PluginJob.objects.order_by('-updated_time')[:5]
    output = ', '.join([q.__str__() for q in current_jobs])
    return HttpResponse(output)

def index(request):
    current_jobs = PluginJob.objects.order_by('-updated_time')
    return TemplateResponse(request, 'processing/index.html', {
            'current_jobs' : current_jobs,
            'user': request.user,
        })

def detail(request, job_id):
    response = "You're looking at the results of question %s."
    return HttpResponse(response % job_id)
