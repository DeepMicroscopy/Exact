# pull official base image
FROM ubuntu:22.04 as builder

# set work directory
WORKDIR /usr/src/exact

ENV DEBIAN_FRONTEND="noninteractive" TZ="SystemV"
RUN apt-get update && apt-get install -y python3-pip dos2unix python3-openslide python3-opencv  libvips libvips-dev netcat\
    && rm -rf /var/lib/apt/lists/*

# set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# install dependencies
RUN pip3 install --upgrade pip
#RUN pip3 install numpy==1.19.4
COPY ./requirements.txt /usr/src/exact/requirements.txt

RUN pip3 install -r requirements.txt

# copy entrypoint.sh and convert to linux format 
COPY ./entrypoint.sh /usr/src/exact/entrypoint.sh

# copy settingsfile 
#COPY ./exact/settings.py.example /usr/src/exact/exact/settings.py
#RUN cat /usr/src/exact/exact/settings.py


RUN dos2unix /usr/src/exact/entrypoint.sh

RUN chmod +x /usr/src/exact/entrypoint.sh
#RUN cat /usr/src/exact/entrypoint.sh

#RUN pip install --upgrade git+git://github.com/ubernostrum/django-registration.git#egg=django-registration
RUN pip list

# copy project
COPY . /usr/src/exact/

#RUN mv /usr/src/exact/exact/settings.py.example /usr/src/exact/exact/settings.py
#RUN cat /usr/src/exact/exact/settings.py

# run entrypoint.sh
ENTRYPOINT ["/usr/src/exact/entrypoint.sh"]