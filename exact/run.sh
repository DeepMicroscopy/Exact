uwsgi --socket /tmp/exact.socket --module exact.wsgi --chmod-socket=666 --enable-threads --processes 6  --async 10  --ugreen 
