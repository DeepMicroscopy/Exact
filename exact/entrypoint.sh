#!/bin/sh

echo "Waiting for postgres..."

if [ "$DATABASE" = "postgres" ]
then

    while ! nc -z $SQL_HOST $SQL_PORT; do
      sleep 5
    done

    echo "PostgreSQL started"
fi

#python manage.py flush --no-input
python3 manage.py migrate
python3 manage.py createsuperuser --no-input
python3 manage.py collectstatic --no-input --clear

exec "$@"
