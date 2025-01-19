# pull official base image
FROM ubuntu:24.04 AS builder

# set work directory
WORKDIR /usr/src/exact

ENV DEBIAN_FRONTEND="noninteractive" TZ="SystemV"
RUN apt-get update && apt-get install -y python3-pip python3-venv dos2unix python3-openslide python3-opencv  libvips libvips-dev netcat-traditional\
    && rm -rf /var/lib/apt/lists/*

# set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN python3 -m venv /opt/venv
# Enable venv
ENV PATH="/opt/venv/bin:$PATH"

# install dependencies
RUN pip3 install --upgrade pip
RUN pip3 install numpy==1.26.0
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