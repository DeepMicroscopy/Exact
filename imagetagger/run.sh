uwsgi --socket /tmp/imagetagger.socket --module imagetagger.wsgi --chmod-socket=666 --enable-threads --processes 4
