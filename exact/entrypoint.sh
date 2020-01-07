#!/bin/sh

echo "Waiting for postgres..."

if [ "$DATABASE" = "postgres" ]
then

    while ! nc -z $SQL_HOST $SQL_PORT; do
      sleep 0.1
    done

    echo "PostgreSQL started"
fi

python manage.py flush --no-input
python manage.py migrate
python manage.py createsuperuser --no-input
python manage.py collectstatic --no-input --clear

exec "$@"
