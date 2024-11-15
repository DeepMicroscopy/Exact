from django.conf import settings
from exact.users.models import Team
from exact.processing.models import PluginJob
from exact.tagger_messages.models import TeamMessage
from django.db.models import Q
from django.core.cache import cache
import shutil





def base_data(request):
    show_datasets = settings.SHOW_DEMO_DATASETS
    show_processing_panel = settings.SHOW_PROCESSING_PANEL and request.user.has_perm('processing.use_server_side_plugins')

    if request.user.is_authenticated:
        my_teams = Team.objects.filter(members=request.user)
        unread_message_count = 0
#        processing_queue = PluginJob.objects.filter(~Q(creator=request.user)).count()
        processing_queue = PluginJob.objects.filter(Q(creator=request.user)).filter(~Q(processing_complete=100)).count()
        #unread_message_count = TeamMessage.in_range(TeamMessage.get_messages_for_user(request.user).filter(~Q(read_by=request.user))).count()
    else:
        my_teams = None
        unread_message_count = 0
        processing_queue = 0

    storage_memory_data = cache.get('storage_memory_data')
    if not storage_memory_data:
        total,used,free = shutil.disk_usage(settings.IMAGE_PATH)
        storage_memory_data = {'used_tb':round(used/1024/1024/1024/1024*10)/10, 
                               'free_tb':round(free/1024/1024/1024/1024*10)/10, 
                               'total_tb': 0.1*round(10*total/1024/1024/1024/1024)}
        cache.set('storage_memory_data', storage_memory_data, 60)


    return {
        'IMPRINT_URL': settings.IMPRINT_URL,
        'USE_IMPRINT': settings.USE_IMPRINT,
        'IMPRINT_NAME': settings.IMPRINT_NAME,
        'TOOLS_ENABLED': settings.TOOLS_ENABLED,
        'SHOW_AVAILABLE_SPACE' : settings.SHOW_AVAILABLE_SPACE,
        'my_teams': my_teams,
        'frontend' : request.user.ui.frontend if hasattr(request.user,'ui') and hasattr(request.user.ui,'frontend') and request.user.ui.frontend else 1,
        'free_tb' : storage_memory_data['free_tb'],
        'used_tb' : storage_memory_data['used_tb'],
        'total_tb' : storage_memory_data['total_tb'],
        'warn_memory' : storage_memory_data['free_tb']/storage_memory_data['total_tb'] < 0.05,
        'unread_message_count': unread_message_count,
        'processing_queue': processing_queue,
        'show_processing_panel' : show_processing_panel,
        'mailing_list': settings.ADD_MAILING_LIST,
        'mailing_list_url': settings.MAILING_LIST_URL,
        'show_datasets':show_datasets
    }
