###########
# BUILDER #
###########


# pull official base image
FROM ubuntu:18.04 as builder

# set work directory
WORKDIR /usr/src/app

ENV DEBIAN_FRONTEND="noninteractive" TZ="SystemV"
# install dependencies
RUN apt-get update && apt-get install --yes  --no-install-recommends build-essential gcc python3-dev python3-pip python3-openslide libvips libvips-dev python3-opencv \
    && rm -rf /var/lib/apt/lists/*


# set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1


# lint
RUN pip3 install --upgrade pip  && pip3 install numpy==1.19.4 flake8 setuptools wheel
COPY . /usr/src/app/

# Just build if code is valid!!!
#RUN flake8 --ignore=E501,F401 .

# install dependencies
COPY ./exact/requirements.txt .
RUN pip3 wheel --no-deps  --wheel-dir /usr/src/app/wheels -r requirements.txt


# copy entrypoint.sh and convert to linux format 
#RUN apt-get update && apt-get install -y dos2unix
#COPY ./entrypoint.prod.sh /usr/src/app/entrypoint.prod.sh

#########
# FINAL #
#########


FROM ubuntu:18.04

# create directory for the app user
RUN mkdir -p /home/app

ENV DEBIAN_FRONTEND="noninteractive" TZ="SystemV"
RUN apt-get update && apt-get install --yes  --no-install-recommends build-essential gcc python3-dev python3-pip python3-openslide libvips  python3-opencv netcat \
    && rm -rf /var/lib/apt/lists/*

# create the app user
RUN addgroup --system  app --gid 1001
RUN adduser --system --group app 

# create the appropriate directories
ENV HOME=/home/app
ENV APP_HOME=/home/app/web
RUN mkdir $APP_HOME &&  mkdir $APP_HOME/static &&  mkdir $APP_HOME/media && mkdir $APP_HOME/images
WORKDIR $APP_HOME

RUN pip3 install --upgrade pip  && pip3 install setuptools wheel
COPY --from=builder /usr/src/app/wheels /wheels
RUN pip3 install --no-cache  /wheels/*

RUN rm -rf /wheels

# copy entrypoint-prod.sh
#COPY --from=builder /usr/src/app/entrypoint.prod.sh $APP_HOME

# copy project
COPY . $APP_HOME

# chown all the files to the app user
#RUN chown -R app:app $APP_HOME

# change to the app user
#USER app