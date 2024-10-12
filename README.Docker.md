<div align="center"><img alt="Nephele" src="https://github.com/sciactive/nephele/raw/master/assets/logo.png" /></div>

# Nephele for Docker

Run [Nephele WebDAV server](https://github.com/sciactive/nephele).

Nephele supports serving files from a local file system or from an S3 compatible object store.

It also supports encryption at rest, so you can keep your data private and secure.

It also supports a deduplicating file store, so you can save space when many duplicates of the same file(s) are stored.

# What is WebDAV

WebDAV (Web Distributed Authoring and Versioning) is a protocol that allows users to access and manage files stored on a remote server. It is commonly used for web-based file sharing and collaboration, as it allows users to upload, download, and manage files directly from a web browser or file manager.

WebDAV is a popular protocol for file sharing and collaboration, as it is easy to use and allows users to access their files from any device with an internet connection. It is also secure, with support for encrypted data transfer and authentication to prevent unauthorized access to files.

# Installation

Pull the latest image with Docker:

```sh
docker pull sciactive/nephele
```

Note: By default, Nephele Serve uses a `.htpasswd` file for user authentication. Create this file in the directory you're serving, or upload this file to your S3 bucket. Use Apache's `htpasswd` utility or an online generator like http://aspirine.org/htpasswd_en.html for ease.

# Usage

For serving from the file system or S3, setup your server root with a `.htpasswd` file.

```sh
cd myserverroot
htpasswd -c .htpasswd mynewuser
htpasswd .htpasswd myseconduser
```

If you are using an S3 object store, upload this file to the root of your bucket.

## Options

Nephele Serve has a number of options available as environment variables. Some options available to [the underlying app](https://github.com/sciactive/nephele/tree/master/packages/nephele-serve#readme) have been left out, because they don't make sense to configure in a Docker container.

- `WORKERS`: Number of cluster workers. Higher number means more requests can be answered simultaneously, but more memory is used. Defaults to 8.
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
- `AUTH_USERNAME`: Authenticate with a given username instead.
- `AUTH_PASSWORD`: Authenticate with a given password instead.
- `ENCRYPTION`: Enable filename and file contents encryption. (When set to "true", "on" or "1".)
- `ENCRYPTION_SALT`: The salt used to generate file content encryption keys.
- `ENCRYPTION_FILENAME_SALT`: The salt used to generate filename encryption keys.
- `ENCRYPTION_FILENAME_IV_SALT`: The salt used to generate filename initialization vectors.
- `ENCRYPTION_FILENAME_ENCODING`: The encoding to use for filenames ('base64' or 'ascii85').
- `ENCRYPTION_GLOBAL_PASSWORD`: A password to use globally instead of user passwords.
- `ENCRYPTION_EXCLUDE`: A list of glob patterns to exclude from the encryption/decryption process.
- `S3_ENDPOINT`: The S3 endpoint URL to connect to.
- `S3_REGION`: The S3 region.
- `S3_ACCESS_KEY`: The S3 access key.
- `S3_SECRET_KEY`: The S3 secret key.
- `S3_BUCKET`: The S3 bucket.
- `NYMPH`: Use Nymph adapter for a deduplicated file system. (Not compatible with home/user directories, .htpasswd auth, S3, or encryption.) (When set to "true", "on" or "1".)
- `NYMPH_JWT_SECRET`: A random string to use as the JWT secret for the Nymph user setup app.
- `NYMPH_REST_PATH`: The path to use for the Nymph rest server used by the user setup app. (Defaults to "/!nymph".)
- `NYMPH_SETUP_PATH`: The path to use for the Nymph user setup app. (Defaults to "/!users".)
- `NYMPH_REGISTRATION`: Don't allow new user registration through the Nymph user setup app. (When set to "false", "off" or "0".)
- `NYMPH_EXPORT`: Export the Nymph database to a NEX file. (Set this to the filename.)
- `NYMPH_IMPORT`: Import the Nymph database from a NEX file. (Set this to the filename.)
- `NYMPH_DB_DRIVER`: The type of the DB driver to use. (Can be "mysql", "postgres", or "sqlite". Defaults to "sqlite").
- `NYMPH_MYSQL_HOST`: The MySQL host if the DB driver is "mysql". (Defaults to "localhost".)
- `NYMPH_MYSQL_PORT`: The MySQL port if the DB driver is "mysql". (Defaults to 3306.)
- `NYMPH_MYSQL_DATABASE`: The MySQL database if the DB driver is "mysql". (Defaults to "nymph".)
- `NYMPH_MYSQL_USERNAME`: The MySQL username if the DB driver is "mysql". (Defaults to "nymph".)
- `NYMPH_MYSQL_PASSWORD`: The MySQL password if the DB driver is "mysql". (Defaults to "password".)
- `NYMPH_MYSQL_PREFIX`: The MySQL table prefix if the DB driver is "mysql". (Defaults to "nymph\_".)
- `NYMPH_POSTGRES_HOST`: The PostgreSQL host if the DB driver is "postgres". (Defaults to "localhost".)
- `NYMPH_POSTGRES_PORT`: The PostgreSQL port if the DB driver is "postgres". (Defaults to 5432.)
- `NYMPH_POSTGRES_DATABASE`: The PostgreSQL database if the DB driver is "postgres". (Defaults to "nymph".)
- `NYMPH_POSTGRES_USERNAME`: The PostgreSQL username if the DB driver is "postgres". (Defaults to "nymph".)
- `NYMPH_POSTGRES_PASSWORD`: The PostgreSQL password if the DB driver is "postgres". (Defaults to "password".)
- `NYMPH_POSTGRES_PREFIX`: The PostgreSQL table prefix if the DB driver is "postgres". (Defaults to "nymph\_".)
- `NYMPH_SQLITE_CACHE_SIZE`: The SQLite cache size to maintain in memory. (Defaults to 100MB).
- `NYMPH_SQLITE_PREFIX`: The SQLite table prefix if the DB driver is "sqlite". (Defaults to "nymph\_".)
- `SERVER_ROOT`: The path of the directory to use as the server root. When using S3, this is the path within the bucket. Defaults to `/data/`, which is set to be a volume. You can bind mount an external directory here to serve it. You must set this to an empty string to serve the root of an S3 bucket!

# Examples

## Docker Compose

### Serving from the File System

Here is an example Docker Compose file configured to serve user directories from a local directory `htdocs`. In this case, you would create a `.htpasswd` file in the `htdocs` directory.

```yaml
services:
  nephele:
    image: 'sciactive/nephele'
    restart: unless-stopped
    ports:
      - '80:80'
    volumes:
      - ./htdocs:/data
    environment:
      REALM: example.com
      USER_DIRECTORIES: 'on'
      SERVE_LISTINGS: 'on'
```

And here is how you would enable HTTPS with a Let's Encrypt certificate.

```yaml
services:
  nephele:
    image: 'sciactive/nephele'
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./htdocs:/data
      - /etc/letsencrypt/:/cert/
    environment:
      REALM: example.com
      PORT: 443
      REDIRECT_PORT: 80
      CERT_FILE: /cert/live/example.com/fullchain.pem
      KEY_FILE: /cert/live/example.com/privkey.pem
      USER_DIRECTORIES: 'on'
      SERVE_LISTINGS: 'on'
```

### Serving from S3

Here is an example configured to serve user directories from an S3 bucket and use file encryption. In this case, you would upload a `.htpasswd` file in the root of the bucket.

Be sure to set the three SALTs and ENCRYPTION_GLOBAL_PASSWORD to different random strings. You can generate them here: https://www.uuidgenerator.net/

```yaml
services:
  nephele:
    image: 'sciactive/nephele'
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - /etc/letsencrypt/:/cert/
    environment:
      REALM: example.com
      PORT: 443
      REDIRECT_PORT: 80
      CERT_FILE: /cert/live/example.com/fullchain.pem
      KEY_FILE: /cert/live/example.com/privkey.pem
      USER_DIRECTORIES: 'on'
      SERVE_LISTINGS: 'on'
      ENCRYPTION: 'on'
      ENCRYPTION_SALT: a57d3f15-c287-4be7-a8cf-c4b89fe31ebf
      ENCRYPTION_FILENAME_SALT: 0dadb21a-37f0-406f-9620-25298c558c47
      ENCRYPTION_FILENAME_IV_SALT: 7baffe09-45b5-472c-a542-b35eb19f875d
      ENCRYPTION_GLOBAL_PASSWORD: 8235dc58-c9ec-4f8b-8ebc-5b8ca16805d3
      S3_ENDPOINT: https://mys3serverendpointurl/
      S3_REGION: us-east-1
      S3_ACCESS_KEY: mys3accesskey
      S3_SECRET_KEY: mys3secretkeyshhdonttell
      S3_BUCKET: MyBucket
      SERVER_ROOT: ''
```

### Serving Deduplicated Files

Here is an example configured to serve deduplicated files from a MySQL backed Nymph database.

```yaml
services:
  nephele:
    image: 'sciactive/nephele'
    restart: unless-stopped
    ports:
      - '80:80'
    volumes:
      - ./htdocs:/data
    environment:
      REALM: example.com
      SERVE_LISTINGS: 'on'
      AUTH_USERNAME: 'admin'
      AUTH_PASSWORD: 'mysupersecretpassword'
      NYMPH: 'on'
      NYMPH_DB_DRIVER: 'mysql'
      NYMPH_MYSQL_HOST: 'mysql'
      NYMPH_MYSQL_DATABASE: 'nephele'
      NYMPH_MYSQL_USERNAME: 'nephele'
      NYMPH_MYSQL_PASSWORD: 'mysupersecretmysqlpassword'

  mysql:
    image: 'mysql:8'
    restart: unless-stopped
    volumes:
      - ./mysql:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: 'mysupersecretmysqlrootpassword'
      MYSQL_DATABASE: 'nephele'
      MYSQL_USER: 'nephele'
      MYSQL_PASSWORD: 'mysupersecretmysqlpassword'
```

Here is another Nymph example, but with HTTPS and user management through Nymph. In this case, you would set up your users, then switch NYMPH_REGISTRATION to "off". The first user you register will be the admin user. You can go to `https://yourserver/!users` to register and manage users.

Be sure to set NYMPH_JWT_SECRET to a different random string. You can generate one here: https://www.uuidgenerator.net/

```yaml
services:
  nephele:
    image: 'sciactive/nephele'
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./htdocs:/data
      - /etc/letsencrypt/:/cert/
    environment:
      REALM: example.com
      PORT: 443
      REDIRECT_PORT: 80
      CERT_FILE: /cert/live/example.com/fullchain.pem
      KEY_FILE: /cert/live/example.com/privkey.pem
      SERVE_LISTINGS: 'on'
      NYMPH: 'on'
      NYMPH_REGISTRATION: 'on'
      NYMPH_JWT_SECRET: 11341666-f7cb-425d-8adf-7afb5f875fbc
      NYMPH_DB_DRIVER: 'mysql'
      NYMPH_MYSQL_HOST: 'mysql'
      NYMPH_MYSQL_DATABASE: 'nephele'
      NYMPH_MYSQL_USERNAME: 'nephele'
      NYMPH_MYSQL_PASSWORD: 'mysupersecretmysqlpassword'

  mysql:
    image: 'mysql:8'
    restart: unless-stopped
    volumes:
      - ./mysql:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: 'mysupersecretmysqlrootpassword'
      MYSQL_DATABASE: 'nephele'
      MYSQL_USER: 'nephele'
      MYSQL_PASSWORD: 'mysupersecretmysqlpassword'
```

## Docker Command

Serve the current directory with the current user's UID/GID.

```sh
docker run \
  --rm \
  --name nephele \
  -p 80:80 \
  --user "$(id -u):$(id -g)" \
  --env SERVE_LISTINGS=true \
  -v ./:/data/ \
  sciactive/nephele
```

Serve the current directory with a specific username and password (not `.htpasswd` file).

```sh
docker run \
  --rm \
  --name nephele \
  -p 80:80 \
  --user "$(id -u):$(id -g)" \
  --env SERVE_LISTINGS=true \
  --env AUTH_USERNAME=admin \
  --env AUTH_PASSWORD=S3cur3P4ssw0rd \
  -v ./:/data/ \
  sciactive/nephele
```

Serve user directories under the server root. This creates directories with the users' usernames, and serves their own directory to them.

```sh
docker run \
  --rm \
  --name nephele \
  -p 80:80 \
  --user "$(id -u):$(id -g)" \
  --env SERVE_LISTINGS=true \
  --env USER_DIRECTORIES=true \
  -v ./:/data/ \
  sciactive/nephele
```

The same, but as a permanent daemonized server.

```sh
docker run \
  -d \
  --restart=unless-stopped \
  --name nephele \
  -p 80:80 \
  --user "$(id -u):$(id -g)" \
  --env SERVE_LISTINGS=true \
  --env USER_DIRECTORIES=true \
  -v ./:/data/ \
  sciactive/nephele
```

Using a certificate from Let's Encrypt for HTTPS traffic.

```sh
docker run \
  -d \
  --restart=unless-stopped \
  --name nephele \
  -p 80:80 \
  -p 443:443 \
  --user "$(id -u):$(id -g)" \
  --env REALM=example.com \
  --env CERT_FILE=/cert/live/example.com/fullchain.pem \
  --env KEY_FILE=/cert/live/example.com/privkey.pem \
  --env REDIRECT_PORT=80 \
  --env SERVE_LISTINGS=true \
  --env USER_DIRECTORIES=true \
  -v ./:/data/ \
  -v /etc/letsencrypt/:/cert/ \
  sciactive/nephele
```

# Encryption

- Important: Remember to generate unique strings for the encryption salts.

Nephele supports file encryption. It uses either a global encryption password or user passwords to encrypt your files.

To enable encryption, set the encryption option and provide three long, random, unique strings for the salt, filename salt, and filename IV salt. You can generate long random strings here: https://www.uuidgenerator.net/

If you use username passwords for encryption, you can't change a user's password or their files will no longer be accessible.

If you disable auth, you must set a global encryption password to use encryption. If you then change this global password, your files will no longer be accessible.

Likewise, if you change any of the salts, your files will no longer be accessible.

You also have a choice of filename encodings. You can set this to 'ascii85' if you know your file system supports non UTF-8 filenames. This will allow files with longer filenames.

You can also exclude files from encryption by providing a comma separated list of glob patterns.

You can find more information about Nephele's file encryption here:
https://github.com/sciactive/nephele/blob/master/packages/plugin-encryption/README.md

# S3 Object Store

- Important: Remember to set `SERVER_ROOT` to an empty string to serve the root of an S3 bucket.

Nephele supports using an S3 object store as its storage backend.

S3 and S3 compatible servers are essentially key-value stores. Nephele can present this store as a hierarchical file structure by using the file path and filename as the key. This is a common practice and is often supported by the native object browser of the store.

By combining an S3 backend with Nephele's encryption feature, you can get the benefits of cloud storage while maintaining your privacy and security.

An important note is that an S3 key has a maximum length of 1024 bytes using UTF-8 encoding. This means the entire file path, including the slash characters that separate directories, can only be 1024 bytes long, so you may run into problems with deeply nested file structures.

You can find more information about S3 keys here:
https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html

WebDAV properties and locks are stored in the metadata of objects. There is no support for properties or locks on a directory, since S3 doesn't really have "real" directories.

S3 does not have the concept of an empty directory, since "directories" are just common prefixes among keys. As such, Nephele represents an empty directory in S3 by creating an empty object under the directory with the name ".nepheleempty". It is safe to delete these objects. It is the same as deleting the empty directory.

You can find more information about Nephele's S3 adapter here:
https://github.com/sciactive/nephele/blob/master/packages/adapter-s3/README.md

# Deduplication with Nymph

- Important: Remember to generate a unique string for the JWT secret (if you're using the Nymph authenticator).

When Nephele is loaded with the Nymph adapter, it will use a deduplicating file storage method. File metadata is stored in the Nymph database, which can be a SQLite3, MySQL, or PostgreSQL database, and file contents are stored on disk using their SHA-384 hash for deduplication.

When using the Nymph adapter, unless auth is disabled, PAM auth is enabled, or a global username/password is set, the Nymph authenticator will be loaded. This authenticator uses Tilmeld, which is a user/group manager for Nymph. The first user you create will be the admin user, then you should turn off registration.

The SQLite3 driver is easier to set up, because the DB can be stored in a file alongside the file blobs, but it is considerably slower if you have many files in your server. It also must be on a local disk, because it uses SQLite's write ahead log.

The MySQL and PostgreSQL drivers are much faster. If you start with a SQLite DB and end up outgrowing it, you can export your Nymph DB to a NEX file, then import it into a new database. The import can take a long time (many hours), so plan for downtime if you do this.

Because the files are deduplicated, this can be a great option if you store something like regular backups, where many files have the same contents.

You can find more information about Nephele's Nymph.js adapter here:
https://github.com/sciactive/nephele/blob/master/packages/adapter-nymph/README.md

You can find more information about Nephele's Nymph.js authenticator here:
https://github.com/sciactive/nephele/blob/master/packages/authenticator-nymph/README.md

You can find more information about Nymph.js:
https://nymph.io

## Exporting and Importing Your Nymph Data

In order to export your Nymph data, first bring your Docker Compose stack up, so that your database is ready to accept connections. If you are upgrading, you should be running the old version of Nephele, so you may need to pin that version in your docker-compose.yml.

Now make these changes to your docker-compose.yml for the Nephele service:

- Change the restart setting to `restart: no`
- Add the following environment variables:
  - `WORKERS: '1 --no-autorestart'`
  - `NYMPH_EXPORT: '/data/db.nex'`

Restart the Nephele service using `docker compose up -d`.

Run `docker compose logs -f` to watch the output. You will see the Nymph DB export starting, then after a while, it will finish and PM2 will exit. Now you can Ctrl+C to exit the logs.

At this point, you can bring down your stack with `docker compose down`.

Make sure the `db.nex` file you just created looks correct. It should be next to your `blob` and `temp` directories, and it should be more than just a kilobyte or two.

Now you can set up your new database. If you are migrating to a new version of Nephele, you should clear your existing database.

Once you're ready to import, change the `NYMPH_EXPORT` environment variable to `NYMPH_IMPORT`, and bring your Docker Compose stack back up with `docker compose up -d`.

Run `docker compose logs -f` to watch the output.

If you see database connection errors, you may need to restart the Nephele container once your database becomes ready, which you can do with `docker compose start nephele`.

If everything goes well, after a long while, you will see the import finish, and PM2 will exit. Now you can Ctrl+C to exit the logs.

Edit your docker-compose.yml file, and undo the changes you made earlier. You should no longer have either the `NYMPH_EXPORT` or the `NYMPH_IMPORT` environment variables.

Restart the Nephele service using `docker compose up -d`, and everything should be working.

# Clustering

The Nephele Serve Docker image uses [PM2](https://pm2.keymetrics.io/docs/usage/cluster-mode/) to run in cluster mode. This lets it answer multiple requests simultaneously. You can scale the number of worker processes with the `WORKERS` environment variable.

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
