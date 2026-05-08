# Installation

## Docker (recommended)

Docker is the fastest and most reliable way to run EXACT. It bundles Django, PostgreSQL, Redis, and Nginx into a single `docker compose` command.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/install/) ≥ 2

### 1. Clone the repository

```bash
git clone https://github.com/DeepMicroscopy/Exact.git
cd Exact
```

### 2. Configure settings

```bash
# Application settings
cp exact/exact/settings.py.example exact/exact/settings.py

# Environment files
cp env.dev env.prod
cp env.dev.db env.prod.db
```

Edit `env.prod` and `env.prod.db` to set your database password, secret key, and allowed hosts.

### 3. Start (development)

The development stack uses Django's built-in server on port 8000 with live reload:

```bash
docker compose -f docker compose.yml up -d --build
docker compose logs -f
```

Navigate to **http://localhost:8000/**

Default credentials: `exact` / `exact`

### 4. Start (production)

The production stack adds Gunicorn + Nginx:

```bash
docker compose -f docker compose.prod.yml up -d --build
docker compose -f docker compose.prod.yml exec web python3 manage.py migrate --noinput
docker compose -f docker compose.prod.yml exec web python3 manage.py createsuperuser
docker compose -f docker compose.prod.yml exec web python3 manage.py collectstatic --no-input --clear
```

Navigate to **http://localhost:1337/**

### Cloud (AWS)

To deploy on AWS with RDS:

```bash
docker compose -f docker compose.prod.aws-db.yml up -d --build
docker compose -f docker compose.prod.aws-db.yml exec web python3 manage.py migrate --noinput
docker compose -f docker compose.prod.aws-db.yml exec web python3 manage.py createsuperuser
docker compose -f docker compose.prod.aws-db.yml exec web python3 manage.py collectstatic --no-input --clear
```

---

## Bare-metal (macOS / Linux)

### System dependencies

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install \
    python3-pip python3-openslide python3-opencv \
    libvips libvips-dev postgresql
```

!!! warning "Ubuntu 20.04 + OpenSlide"
    There is a [known rendering issue](https://github.com/libvips/libvips/issues/1401) with libvips on Ubuntu 20.04.
    Fix: build [pixman](https://gitlab.freedesktop.org/pixman/pixman/-/blob/master/INSTALL) from source.

### Database

```bash
sudo systemctl start postgresql.service
sudo -iu postgres psql -c "CREATE USER exact PASSWORD 'exact';"
sudo -iu postgres psql -c "CREATE DATABASE exact WITH OWNER exact ENCODING UTF8;"
```

### Application

```bash
pip3 install -r requirements.txt
cp exact/exact/settings.py.example exact/exact/settings.py
# edit settings.py — at minimum set SECRET_KEY, ALLOWED_HOSTS, and DATABASE

cd exact
python3 manage.py migrate
python3 manage.py createsuperuser
python3 manage.py runserver
```

---

## Configuration Reference

Key settings in `exact/exact/settings.py`:

| Setting | Description |
|---|---|
| `SECRET_KEY` | Django secret key — must be unique in production |
| `DEBUG` | Set `False` in production |
| `ALLOWED_HOSTS` | List of hostnames the server responds to |
| `DATABASES` | PostgreSQL connection settings |
| `IMAGE_PATH` | Directory where uploaded images are stored |
| `UPLOAD_FS_GROUP` | OS group that owns uploaded files |
| `CACHES` | Redis cache config — see `redis/CACHING.md` |

### Email (registration verification)

```python
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.googlemail.com'
EMAIL_PORT = '587'
EMAIL_HOST_USER = 'you@example.com'
EMAIL_HOST_PASSWORD = 'yourpassword'
EMAIL_USE_TLS = True
```

---

## Upgrading

```bash
pip install -U -r requirements.txt
python3 manage.py migrate
python3 manage.py compilemessages
python3 manage.py collectstatic
```

Check [UPGRADE.md](https://github.com/DeepMicroscopy/Exact/blob/master/UPGRADE.md) for release-specific migration steps.
