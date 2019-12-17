uwsgi --socket /tmp/imagetagger.socket --module imagetagger.wsgi --chmod-socket=666 --enable-threads --processes 6  --async 10  --ugreen 
