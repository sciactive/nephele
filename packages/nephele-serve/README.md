# Nephele Serve - File System Backed WebDAV Server

Run Nephele WebDAV server to serve files from a file system.

# What is WebDAV

WebDAV (Web Distributed Authoring and Versioning) is a protocol that allows users to access and manage files stored on a remote server. It is commonly used for web-based file sharing and collaboration, as it allows users to upload, download, and manage files directly from a web browser or file manager.

WebDAV is a popular protocol for file sharing and collaboration, as it is easy to use and allows users to access their files from any device with an internet connection. It is also secure, with support for encrypted data transfer and authentication to prevent unauthorized access to files.

# Installation

Quickly install Nephele Serve using npm:

```sh
sudo npm install -g nephele-serve
```

Note: By default, Nephele Serve uses a `.htpasswd` file for user authentication. Create this file in the directory you're serving. Use Apache's `htpasswd` utility or an online generator like http://aspirine.org/htpasswd_en.html for ease.

## Adding System User Authentication

To authenticate with system users instead of an htpasswd file, follow these steps to install PAM development libraries and build tools for your OS:

1. Install PAM development libraries:

- For CentOS/RHEL: `sudo yum install pam-devel gcc gcc-c++ make`
- For Fedora: `sudo dnf install pam-devel gcc gcc-c++ make`
- For Debian/Ubuntu: `sudo apt install libpam0g-dev build-essential`
- Arch and macOS come pre-installed with the necessary tools.

2. Now install Nephele Serve:

```sh
sudo npm install -g nephele-serve
```

Note: Files and directories will be created with the proper ownership for the logged in user when using the PAM authenticator.

# Usage

Serve the current directory.

```sh
sudo nephele-serve .
```

Serve the current directory with a specific username and password (not .htpasswd file).

```sh
sudo nephele-serve --auth-username admin --auth-password "S3cur3P4ssw0rd" .
```

Serve users' home directories (requires PAM libraries).

```sh
sudo nephele-serve --home-directories
```

Serve user directories under the server root. This creates directories with the users' usernames, and serves their own directory to them.

```sh
sudo nephele-serve --user-directories .
```

If you want to run it without installing it, you can do that too.

```sh
sudo npx nephele-serve .
```

If you want to run it without root, you can do that too, but you must set the port to something higher than 1000, and you'll likely only be able to log in (with PAM) as the user who runs the script.

```sh
nephele-serve -p 8080 .
```

Only regular users (UIDs 500-59999) are allowed to log in.

## Cluster with PM2

Nephele Serve supports clustering for handling high loads. Here's how to set up a cluster of 8 Nephele Serve instances.

```sh
sudo npm install -g pm2
sudo pm2 start -i 8 -u root --uid 0 \
  nephele-serve \
  --node-args "--experimental-specifier-resolution=node" \
  -- \
  --home-directories
```

Then you can save it and have it load at system startup.

```sh
sudo pm2 save
sudo pm2 startup systemd
```

## Comprehensive Example Setup

For a complete setup example with TLS, directory listings, and cluster mode, see the extended setup instructions at the end of this document.

# Updates

Nephele Serve will check for updates on launch, but if your server is set to load on system start with PM2, you probably won't ever see the notification that there's an update. Therefore, every once in a while you should install the latest version (of PM2 and Nephele Serve).

```sh
# Update nephele-serve and pm2
sudo npm i -g nephele-serve pm2
# Restart the server
sudo pm2 restart all
```

# Help

```sh
nephele-serve --help
```

Here's a copy of the help output:

```
Usage: nephele-serve [options] [directory]

Command line WebDAV server with browser support for local users to access files remotely.

Arguments:
  directory                                  The path of the directory to use as the server root.

Options:
  -v, --version                              Print the current version
  -h, --host <host>                          A host address to listen on. The default is to listen on all external hosts. (default: "::")
  -r, --realm <realm>                        The realm reported to the user by the server when authentication is requested. Defaults to the system hostname.
  --cert <cert_file>                         The filename of a certificate to use for HTTPS in PEM format.
  --key <key_file>                           The filename of a private key to use for HTTPS in PEM format.
  -p, --port <port>                          The port to listen on. Defaults to 443 if a cert is provided, 80 otherwise.
  --redirect-port <redirect_port>            The port to redirect HTTP traffic to HTTPS. Set this to 80 if you want to redirect plain HTTP requests.
  -t, --timeout <milliseconds>               Request timeout. Requests will be terminated if they take longer than this time. Defaults to 7200000, or 2 hours.
  --keep-alive-timeout <milliseconds>        Server will wait this long for additional data after writing its last response.
  --home-directories                         Serve users' home directories to them when they log in. (Impies --pam-auth.)
  --user-directories                         Serve users their own directory under the server root when they log in.
  --serve-indexes                            Serve index.html and index.htm files when the user requests a directory.
  --serve-listings                           Serve directory listings with file management forms when the user requests a directory.
  --no-auth                                  Don't require authentication. (Not compatible with --home-directories or --user-directories.)
  --pam-auth                                 Use PAM authentication. (Requires PAM libraries.)
  --auth-user-filename                       htpasswd filename. (Defaults to '.htpasswd'.)
  --auth-user-file                           A specific htpasswd file to use for every request.
  --auth-username <username>                 Authenticate with a given username instead.
  --auth-password <password>                 Authenticate with a given password instead.
  --encryption                               Enable filename and file contents encryption.
  --encryption-salt <salt>                   The salt used to generate file content encryption keys.
  --encryption-filename-salt <salt>          The salt used to generate filename encryption keys.
  --encryption-filename-iv-salt <salt>       The salt used to generate filename initialization vectors.
  --encryption-filename-encoding <encoding>  The encoding to use for filenames ('base64' or 'ascii85').
  --encryption-global-password <password>    A password to use globally instead of user passwords.
  --encryption-exclude <globlist>            A list of glob patterns to exclude from the encryption/decryption process.
  --no-update-check                          Don't check for updates.
  --help                                     display help for command

Environment Variables:
  HOST                                       Same as --host.
  PORT                                       Same as --port.
  REDIRECT_PORT                              Same as --redirect-port.
  TIMEOUT                                    Same as --timeout.
  KEEPALIVETIMEOUT                           Same as --keep-alive-timeout.
  REALM                                      Same as --realm.
  CERT_FILE                                  Same as --cert.
  CERT                                       Text of a cert in PEM format.
  KEY_FILE                                   Same as --key.
  KEY                                        Text of a key in PEM format.
  HOME_DIRECTORIES                           Same as --home-directories when set to "true", "on" or "1".
  USER_DIRECTORIES                           Same as --user-directories when set to "true", "on" or "1".
  SERVE_INDEXES                              Same as --serve-indexes when set to "true", "on" or "1".
  SERVE_LISTINGS                             Same as --serve-listings when set to "true", "on" or "1".
  AUTH                                       Same as --no-auth when set to "false", "off" or "0".
  PAM_AUTH                                   Same as --pam-auth when set to "true", "on" or "1".
  AUTH_USER_FILENAME                         Same as --auth-user-filename.
  AUTH_USER_FILE                             Same as --auth-user-file.
  AUTH_USERNAME                              Same as --auth-username.
  AUTH_PASSWORD                              Same as --auth-password.
  ENCRYPTION                                 Same as --encryption when set to "true", "on" or "1".
  ENCRYPTION_SALT                            Same as --encryption-salt.
  ENCRYPTION_FILENAME_SALT                   Same as --encryption-filename-salt.
  ENCRYPTION_FILENAME_IV_SALT                Same as --encryption-filename-iv-salt.
  ENCRYPTION_FILENAME_ENCODING               Same as --encryption-filename-encoding.
  ENCRYPTION_GLOBAL_PASSWORD                 Same as --encryption-global-password.
  ENCRYPTION_EXCLUDE                         Same as --encryption-exclude.
  UPDATE_CHECK                               Same as --no-update-check when set to "false", "off" or "0".
  SERVER_ROOT                                Same as [directory].

Options given on the command line take precedence over options from an environment variable.

Encryption:
  Nephele supports file encryption. It uses either a global encryption password
  or user passwords to encrypt your files.

  To enable encryption, set the encryption option and provide three long,
  random, unique strings for the salt, filename salt, and filename IV salt. You
  can generate long random strings here: https://www.uuidgenerator.net/

  If you use username passwords for encryption, you can't change a user's
  password or their files will no longer be accessible.

  If you disable auth, you must set a global encryption password to use
  encryption. If you then change this global password, your files will no longer
  be accessible.

  Likewise, if you change any of the salts, your files will no longer be
  accessible.

  You also have a choice of filename encodings. You can set this to 'ascii85' if
  you know your file system supports non UTF-8 filenames. This will allow files
  with longer filenames.

  You can also exclude files from encryption by providing a comma separated list
  of glob patterns.

  You can find more information about Nephele's file encryption here:
  https://github.com/sciactive/nephele/blob/master/packages/plugin-encryption/README.md

Nephele repo: https://github.com/sciactive/nephele
Copyright (C) 2022-2024 SciActive, Inc
https://sciactive.com/
```

# Node Warning

If you see this warning:

```
(node:319632) ExperimentalWarning: The Node.js specifier resolution flag is experimental. It could change or be removed at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
```

Don't worry, it's because the script is using `--experimental-specifier-resolution=node` to be able to load the PAM authentication module from an ES module.

# Comprehensive Example

This example shows the steps for a setup where you:

- use an Ubuntu or Debian based server
- use a Let's Encrypt certificate for TLS
- want to serve user directories for system users out of a custom folder
- want to serve directory listings for browser support
- want to use a cluster of 8 worker processes
- want to have the server load on startup

You would replace example.com with your domain, and the path at the end with your server root path.

```sh
# Follow these install directions to install Node (the minimum Node version is v18):
# https://github.com/nodesource/distributions#installation-instructions

# Install requirements.
sudo apt install libpam0g-dev build-essential
# Install nephele-serve and pm2.
sudo npm i -g nephele-serve pm2

# Start a nephele-serve cluster.
sudo pm2 start -i 8 -u root --uid 0 \
  nephele-serve \
  --node-args "--experimental-specifier-resolution=node" \
  -- \
  --pam-auth \
  --user-directories \
  --serve-listings \
  --cert /etc/letsencrypt/live/example.com/fullchain.pem \
  --key /etc/letsencrypt/live/example.com/privkey.pem \
  /path/to/your/data/directory/

# Save the cluster and have it start on system start.
sudo pm2 save
sudo pm2 startup systemd
```

I recommend installing Node from NodeSource instead of apt, because apt tends to have very outdated versions and lots of unnecessary dependencies.

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
