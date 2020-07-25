from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpRequest, HttpResponse
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.utils.translation import ugettext_lazy as _
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view
from rest_framework.exceptions import ParseError
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK
from exact.annotations.models import ExportFormat, AnnotationType
from exact.annotations.forms import ExportFormatEditForm
from exact.images.forms import ImageSetCreationForm
from exact.administration.forms import ProductCreationForm
from exact.administration.models import Product
from exact.images.models import ImageSet
from exact.users.forms import TeamCreationForm
from .models import Team, User
from .serializers import TeamSerializer

@login_required
def create_team(request):
    form = TeamCreationForm()
    if request.method == 'POST':
        form = TeamCreationForm(request.POST)
        if form.is_valid():
            with transaction.atomic():
                form.instance.save()
                form.instance.memberships.create(user=request.user,
                                                 is_admin=True)
            return redirect(reverse('users:team', args=(form.instance.id,)))
    return render(request, 'users/create_team.html', {
        'form': form,
    })


@login_required
@require_POST
def revoke_team_admin(request, team_id, user_id):
    user = get_object_or_404(User, id=user_id)
    team = get_object_or_404(Team, id=team_id)

    if user == request.user:
        messages.warning(
            request, _('You can not revoke your own admin privileges.').format(
                team.name))
        return redirect(reverse('users:team', args=(team.id,)))

    if team.has_perm('user_management', request.user):
        team.memberships.filter(user=user).update(is_admin=False)
    else:
        messages.warning(
            request,
            _('You do not have permission to revoke this users admin '
              'privileges in the team {}.').format(team.name))

    return redirect(reverse('users:team', args=(team.id,)))


@login_required
@require_POST
def grant_team_admin(request, team_id, user_id):
    user = get_object_or_404(User, id=user_id)
    team = get_object_or_404(Team, id=team_id)

    if not team.members.filter(pk=request.user.pk).exists():
        messages.warning(request, _('You are no member of the team {}.').format(
            team.name))
        return redirect(reverse('users:explore_team'))

    # Allow granting of admin privileges any team member if there is no admin
    if team.has_perm('user_management', request.user) or not team.admins:
        team.memberships.filter(user=user).update(is_admin=True)
    else:
        messages.warning(
            request,
            _('You do not have permission to grant this user admin '
              'privileges in the team {}.').format(team.name))
    return redirect(reverse('users:team', args=(team.id,)))


@login_required
def explore_team(request):
    teams = Team.objects.all()

    query = request.GET.get('query')
    get_query = ''
    if query:
        teams = teams.filter(name__icontains=query)
        get_query = '&query=' + str(query)
    paginator = Paginator(teams, 25)
    page = request.GET.get('page')
    page_teams = paginator.get_page(page)

    return render(request, 'base/explore.html', {
        'mode': 'team',
        'teams': page_teams,  # to separate what kind of stuff is displayed in the view
        'paginator': page_teams,  # for page stuff
        'get_query': get_query,
        'query': query,
    })


@login_required
def explore_user(request):
    users = User.objects.all().order_by('-points')

    query = request.GET.get('query')
    get_query = ''
    if query:
        users = users.filter(username__icontains=query)
        get_query = '&query=' + str(query)
    paginator = Paginator(users, 25)
    page = request.GET.get('page')
    page_users = paginator.get_page(page)

    return render(request, 'base/explore.html', {
        'mode': 'user',
        'users': page_users,  # to separate what kind of stuff is displayed in the view
        'paginator': page_users,  # for page stuff
        'get_query': get_query,
        'query': query,
    })


@login_required
def leave_team(request, team_id, user_id=None):
    team = get_object_or_404(Team, id=team_id)

    user = request.user
    warning = _('You are not in the team.')

    try:
        user_id = int(user_id)
    except ValueError:
        return redirect(reverse('users:team', args=(team.id,)))

    if user_id and user_id != request.user.pk:
        user = get_object_or_404(User, id=user_id)
        warning = _('The user is not in the team.')

        if not team.has_perm('user_management', request.user):
            messages.warning(
                request,
                _('You do not have the permission to kick other users from this team.'))
            return redirect(reverse('users:team', args=(team.id,)))

    if not team.members.filter(pk=user.pk).exists():
        messages.warning(request, warning)
        return redirect(reverse('users:team', args=(team.id,)))

    if request.method == 'POST':
        team.memberships.filter(user=user).delete()
        if team.memberships.count() is 0:
            for imageset in ImageSet.objects.filter(team=team):
                imageset.public = True
                imageset.image_lock = True
                imageset.save()
            team.delete()
        if user == request.user:
            return redirect(reverse('users:explore_team'))
        return redirect(reverse('users:team', args=(team.id,)))

    return render(request, 'users/leave_team.html', {
        'user': user,
        'team': team,
        'last': team.memberships.count() is 1,
    })


@require_POST
@login_required
def add_team_member(request: HttpRequest, team_id: int) -> HttpResponse:
    """Add a member to a team."""
    team = get_object_or_404(Team, id=team_id)

    username = request.POST.get('username')

    if not team.has_perm('user_management', request.user):
        messages.warning(
            request, _(
                'You do not have the permission to add users to the team {}.')
            .format(team.name))
        return redirect(reverse('users:team', args=(team_id,)))

    user = User.objects.filter(username=username).first()
    if not user:
        messages.warning(request, _('The user {} does not exist.')
                         .format(username))
        return redirect(reverse('users:team', args=(team_id,)))

    if team.members.filter(pk=user.pk).exists():
        messages.info(request, _(
            'The user {} is already a member of the team {}.').format(
            username, team.name))
        return redirect(reverse('users:team', args=(team_id,)))

    team.memberships.create(user=user)

    messages.success(request,
                     _('The user {} has been added to the team successfully.')
                     .format(username))

    return redirect(reverse('users:team', args=(team_id,)))


@login_required
def view_team(request, team_id):
    team = get_object_or_404(Team, id=team_id)
    members = team.members.all().order_by('id')

    is_member = request.user in members
    admins = team.admins

    imagesets = ImageSet.objects.filter(team=team).annotate(
        image_count_agg=Count('images')).prefetch_related('set_tags').\
        order_by('-public', 'name')
    export_formats = ExportFormat.objects.filter(
        team=team).prefetch_related('annotations_types').order_by('name')

    if not is_member:
        export_formats = export_formats.filter(public=True)
        imagesets = imagesets.filter(public=True)

    export_format_forms = []
    for format_instance in export_formats:
        form = ExportFormatEditForm(instance=format_instance)
        form.fields['annotations_types'].queryset = AnnotationType.objects.filter(product__in=Product.objects.
                                                                                  filter(team__in=Team.objects.
                                                                                         filter(members=request.user)))
        export_format_forms.append(form)

    test_imagesets = imagesets.filter(set_tags__name='test').order_by('-public', 'name')

    products = Product.objects.filter(team=team).order_by('team_id')

    return render(request, 'users/view_team.html', {
        'team': team,
        'members': members,
        'admins': admins,
        'imagesets': imagesets,
        'date_imagesets': sorted(imagesets, key=lambda i: i.time, reverse=True),
        'size_imagesets': sorted(imagesets, key=lambda i: i.image_count, reverse=True),
        'test_imagesets': test_imagesets,
        'imageset_creation_form': ImageSetCreationForm(),
        'product_creation_form': ProductCreationForm(),
        'products': products,
        'team_perms': team.get_perms(request.user),
        'export_formats_forms': export_format_forms,
    })


@login_required
def user(request, user_id):
    user = get_object_or_404(User, id=user_id)
    teams = Team.objects.filter(members=user)

    return render(request, 'users/view_user.html', {
        'user': user,
        'teams': teams,
    })


@login_required
@api_view(['GET'])
def user_autocomplete(request) -> Response:
    try:
        username_query = str(request.GET['query']).lower()
    except (KeyError, TypeError, ValueError):
        raise ParseError
    user_suggestions = list(User.objects.filter(username__startswith=username_query))
    user_suggestions.extend(list(User.objects.filter(~Q(username__startswith=username_query) & Q(username__contains=username_query))))
    user_suggestions = [user_suggestion.username for user_suggestion in user_suggestions]
    print(user_suggestions)

    return Response({
        'query': username_query,
        'suggestions': user_suggestions,
    }, status=HTTP_200_OK)


@api_view(['GET'])
def api_filter_teams(request) -> Response:
    try:
        name = request.data.get('name', None)
        id = int(request.data.get('id',-1))
    except (KeyError, TypeError, ValueError):
        raise ParseError

    teams = Team.objects.filter(members=request.user)
    if name is not None:
        teams = teams.filter(name=name)
    if id > 0:
        teams = teams.filter(id=id)
    serializer = TeamSerializer(teams, many=True, context={'request': request, })
    return Response(serializer.data, status=HTTP_200_OK)

