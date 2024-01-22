<div align="center"><img alt="Nephele" src="https://github.com/sciactive/nephele/raw/master/assets/logo.png" /></div>

# Nephele Serve for Docker - File System Backed WebDAV Server

Run Nephele WebDAV server to serve files from a file system.

# What is WebDAV

WebDAV (Web Distributed Authoring and Versioning) is a protocol that allows users to access and manage files stored on a remote server. It is commonly used for web-based file sharing and collaboration, as it allows users to upload, download, and manage files directly from a web browser or file manager.

WebDAV is a popular protocol for file sharing and collaboration, as it is easy to use and allows users to access their files from any device with an internet connection. It is also secure, with support for encrypted data transfer and authentication to prevent unauthorized access to files.

# Installation

Pull the latest image with Docker:

```sh
docker pull sciactive/nephele
```

Note: By default, Nephele Serve uses a `.htpasswd` file for user authentication. Create this file in the directory you're serving. Use Apache's `htpasswd` utility or an online generator like http://aspirine.org/htpasswd_en.html for ease.

# Usage

Serve the current directory.

```sh
docker run --rm --name nephele -p 80:80 --user "$(id -u):$(id -g)" --env SERVE_LISTINGS=true -v ./:/data/ sciactive/nephele
```

Serve user directories under the server root. This creates directories with the users' usernames, and serves their own directory to them.

```sh
docker run --rm --name nephele -p 80:80 --user "$(id -u):$(id -g)" --env SERVE_LISTINGS=true --env USER_DIRECTORIES=true -v ./:/data/ sciactive/nephele
```

## Options

Nephele Serve has a number of options available as environment variables. You can see the `SERVE_LISTINGS` and `USER_DIRECTORIES` options used above. Here is the list of available options. Some options available to [the underlying app](https://github.com/sciactive/nephele/tree/master/packages/nephele-serve#readme) have been left out, because they don't make sense to configure in a Docker container.

- `WORKERS`: Number of cluster workers. Higher number means more requests can be answers simultaneously, but more memory is used. Defaults to 8.
- `REALM`: The realm reported to the user by the server when authentication is requested. Defaults to the system hostname.
- `PORT`: The port to listen on (inside the container). Defaults to 443 if a cert is provided, 80 otherwise.
- `REDIRECT_PORT`: The port to redirect HTTP traffic to HTTPS. Set this to 80 if you want to redirect plain HTTP requests.
- `TIMEOUT`: Request timeout. Requests will be terminated if they take longer than this time. Defaults to 7200000, or 2 hours.
- `KEEPALIVETIMEOUT`: Server will wait this long for additional data after writing its last response.
- `CERT_FILE`: The filename of a certificate to use for HTTPS in PEM format.
- `CERT`: Text of a cert in PEM format.
- `KEY_FILE`: The filename of a private key to use for HTTPS in PEM format.
- `KEY`: Text of a key in PEM format.
- `USER_DIRECTORIES`: Serve users their own directory under the server root when they log in. (When set to "true", "on" or "1".)
- `SERVE_INDEXES`: Serve index.html and index.htm files when the user requests a directory. (When set to "true", "on" or "1".)
- `SERVE_LISTINGS`: Serve directory listings with file management forms when the user requests a directory. (When set to "true", "on" or "1".)
- `AUTH` Don't require authentication. (Not compatible with `USER_DIRECTORIES`.) (When set to "false", "off" or "0".)
- `AUTH_USER_FILENAME`: htpasswd filename. (Defaults to '.htpasswd'.)
- `AUTH_USER_FILE`: A specific htpasswd file to use for every request.
- `SERVER_ROOT`: The path of the directory to use as the server root. Defaults to `/data/`, which is set to be a volume. You can bind mount an external directory here to serve it.

## Clustering

The Nephele Serve Docker image uses [PM2](https://pm2.keymetrics.io/docs/usage/cluster-mode/) to run in cluster mode. This lets it answer multiple requests simultaneously. You can scale the number of worker processes with the `WORKERS` environment variable.

## Serving HTTPS Traffic

You can provide a certificate and key to serve HTTPS traffic.

```sh
docker run \
  --rm \
  --name nephele \
  -p 80:80 \
  -p 443:443 \
  --user "$(id -u):$(id -g)" \
  --env CERT_FILE=/cert/fullchain1.pem \
  --env KEY_FILE=/cert/privkey1.pem \
  --env SERVE_LISTINGS=true \
  --env USER_DIRECTORIES=true \
  -v ./:/data/ \
  -v /etc/letsencrypt/archive/example.com/:/cert/ \
  sciactive/nephele
```

# License

Copyright 2022-2024 SciActive Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
