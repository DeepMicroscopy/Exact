#!/bin/sh


if [ "$DATABASE" = "postgres" ]
then

	echo "Waiting for postgres..."

    while ! nc -z $SQL_HOST $SQL_PORT; do
      sleep 5
    done

    echo "PostgreSQL started"
fi

python3 manage.py migrate
python3 manage.py collectstatic --no-input --clear

exec "$@"
