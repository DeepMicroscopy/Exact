"""
Helpers for viewsets that use rest_flex_fields: decide from the query parameters (fields, omit, expand) which
relations of a list/detail response are going to be serialized, so that exactly these can be prefetched
(instead of one query per row).
"""


def _names(request, key):
    value = request.query_params.get(key, '')
    return [name.strip() for name in value.split(',') if name.strip()]


def serializes_field(request, name):
    """Whether the top level field `name` is part of the response."""
    fields = _names(request, 'fields')
    if fields:
        return name in {field.split('.')[0] for field in fields}
    return name not in _names(request, 'omit')


def expands_field(request, name):
    """Whether the top level field `name` is expanded (full objects instead of ids)."""
    return name in {field.split('.')[0] for field in _names(request, 'expand')}


def omits_nested(request, path):
    """Whether the nested field (e.g. 'images.annotations') is omitted explicitly."""
    return path in _names(request, 'omit')
