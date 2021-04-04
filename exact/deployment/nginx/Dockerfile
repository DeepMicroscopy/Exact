FROM nginx:1.19.0-alpine

RUN rm /etc/nginx/conf.d/default.conf
RUN rm /etc/nginx/nginx.conf
COPY ./deployment/nginx/nginx.conf /etc/nginx/nginx.conf
