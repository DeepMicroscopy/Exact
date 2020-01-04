# pull official base image
FROM python:3.6.0

# set work directory
WORKDIR /usr/src/imagetagger

RUN apt-get update && apt-get install -y python3-dev python3-openslide netcat dos2unix \
    && rm -rf /var/lib/apt/lists/*

# set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# install dependencies
RUN pip install --upgrade pip
COPY ./requirements.txt /usr/src/imagetagger/requirements.txt

RUN pip install -r requirements.txt

# copy entrypoint.sh and convert to linux format 
COPY ./entrypoint.sh /usr/src/imagetagger/entrypoint.sh

RUN dos2unix /usr/src/imagetagger/entrypoint.sh

RUN chmod +x /usr/src/imagetagger/entrypoint.sh
#RUN cat /usr/src/imagetagger/entrypoint.sh

RUN pip install git+git://github.com/ubernostrum/django-registration.git#egg=django-registration
RUN pip list

# copy project
COPY . /usr/src/imagetagger/

# run entrypoint.sh
ENTRYPOINT ["/usr/src/imagetagger/entrypoint.sh"]