# syntax=docker/dockerfile:1

FROM node:lts-alpine

LABEL org.opencontainers.image.authors="https://sciactive.com"
LABEL org.opencontainers.image.title="Nephele Serve"
LABEL org.opencontainers.image.description="A WebDAV server."
LABEL org.opencontainers.image.version="1.0.0-alpha.36"
LABEL org.opencontainers.image.url="https://github.com/sciactive/nephele"
LABEL org.opencontainers.image.source="https://github.com/sciactive/nephele"
LABEL org.opencontainers.image.licenses="Apache-2.0"

# Node and PM2 environment variables.
ENV WORKERS=8
ENV NODE_ENV=production

# Nephele environment variables.
ENV SERVER_ROOT=/data/
ENV UPDATE_CHECK=false

RUN mkdir /data
VOLUME ["/data"]

RUN npm i -g pm2 nephele-serve@1.0.0-alpha.36

EXPOSE 80
EXPOSE 443

CMD pm2-runtime start -i $WORKERS --node-args "--experimental-specifier-resolution=node" nephele-serve -- $SERVER_ROOT
