from django.conf import settings
from django.shortcuts import redirect, render
from django.urls import reverse
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK
import time
from rest_framework.decorators import api_view

def index(request):
    return redirect(reverse('images:index'))

@api_view(['GET'])
def report_time(request) -> Response:
    return Response({'unixtime': time.time()}, HTTP_200_OK)

def problem_report(request):
    if settings.PROBLEMS_TEXT is not '':
        return render(request, 'base/problem.html', {
            'text': settings.PROBLEMS_TEXT
        })
    else:
        return redirect(settings.PROBLEMS_URL)
