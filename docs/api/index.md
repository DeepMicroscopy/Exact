# API Reference

EXACT exposes a full REST API at `/api/v1/`. The interactive reference below is generated from the OpenAPI specification.

## Authentication

```bash
# Obtain a token
curl -X POST http://your-server/api/auth/token/login/ \
  -H 'Content-Type: application/json' \
  -d '{"username": "exact", "password": "exact"}'
# → {"auth_token": "abc123..."}

# Use the token in subsequent requests
curl http://your-server/api/v1/images/image_sets/ \
  -H 'Authorization: Token abc123...'
```

## Available Resources

| Resource | Endpoint |
|---|---|
| Users | `/api/v1/users/users/` |
| Teams | `/api/v1/users/teams/` |
| Team memberships | `/api/v1/users/team_membership/` |
| Images | `/api/v1/images/images/` |
| Image sets | `/api/v1/images/image_sets/` |
| Set tags | `/api/v1/images/set_tags/` |
| Screening modes | `/api/v1/images/screening_modes/` |
| Annotations | `/api/v1/annotations/annotations/` |
| Annotation types | `/api/v1/annotations/annotation_types/` |
| Annotation media files | `/api/v1/annotations/annotation_media_files/` |
| Verifications | `/api/v1/annotations/verifications/` |
| Log image actions | `/api/v1/annotations/log_image_actions/` |
| Products | `/api/v1/administration/products/` |

## Filtering, Expanding, and Field Selection

All list endpoints support [django-filter](https://django-filter.readthedocs.io/) for filtering and [drf-flex-fields](https://github.com/rsinger86/drf-flex-fields) for field selection.

### Filter by field value

```
GET /api/v1/images/image_sets/?name__contains=Mitosis
```

### Expand nested objects

```
GET /api/v1/images/image_sets/?expand=product_set,main_annotation_type
```

### Include only specific fields

```
GET /api/v1/images/image_sets/?fields=id,name
```

### Exclude fields

```
GET /api/v1/images/image_sets/?omit=images,product_set
```

## Python Client

```bash
pip install EXACT-Sync
```

```python
from exact_sync.v1.configuration import Configuration
from exact_sync.v1 import ApiClient
from exact_sync.v1.api import images_api

config = Configuration(host="http://localhost:8000")
config.username = "exact"
config.password = "exact"

with ApiClient(config) as client:
    api = images_api.ImagesApi(client)
    imagesets = api.images_image_sets_list()
    print(imagesets.results)
```

See [EXACT-Sync on GitHub](https://github.com/DeepMicroscopy/EXACT-Sync) and the [example notebooks](https://nbviewer.jupyter.org/github/DeepMicroscopy/Exact/tree/master/doc/).

---

## Interactive API Explorer

<swagger-ui src="./openapi.yml"/>
