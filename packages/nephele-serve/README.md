# Nephele - Local File Server

Run Nephele WebDAV server to serve local files.

# What is WebDAV

WebDAV (Web Distributed Authoring and Versioning) is a protocol that allows users to access and manage files stored on a remote server. It is commonly used for web-based file sharing and collaboration, as it allows users to upload, download, and edit files directly from a web browser.

WebDAV is based on HTTP (Hypertext Transfer Protocol) and uses the same basic communication methods, but adds additional features and functionality specifically designed for file management. These features include support for file locking, collections, and metadata.

WebDAV is a popular protocol for file sharing and collaboration, as it is easy to use and allows users to access their files from any device with an internet connection. It is also secure, with support for encrypted data transfer and authentication to prevent unauthorized access to files.

# Installation

Follow these steps to install PAM development libraries for your OS:

```sh
# Centos and RHEL:
sudo yum install pam-devel

# Debian/Ubuntu:
sudo apt install libpam0g-dev

# Arch and macOS: already installed
```

(Source: https://www.npmjs.com/package/authenticate-pam#Install)

Then,

```sh
sudo npm install -g nephele-serve
```

# Usage

To serve the current directory.

```sh
sudo nephele-serve .
```

To serve users' home directories.

```sh
sudo nephele-serve --home-directories
```

To serve user directories under the current directory. This creates directories within the server root with the users' usernames, and serves their own directory to them.

```sh
sudo nephele-serve --user-directories .
```

If you want to run it without installing it, you can do that too.

```sh
sudo npx nephele-serve .
```

If you want to run it without root, you can do that too, but you must set the port to something higher than 1000, and you'll likely only be able to log in with the user who runs the script.

```sh
nephele-serve -p 8080 .
```

Only regular users (UIDs 500-59999) are allowed to log in.

# Cluster with PM2

You can load Nephele as a cluster of worker processes using PM2. The following will start a cluster of 8 instances serving users' home directories.

```sh
sudo npm install -g pm2
sudo pm2 start -i 8 -u root --uid 0 nephele-serve --node-args "--experimental-specifier-resolution=node" -- --home-directories
```

Then you can save it and have it load at system startup.

```sh
sudo pm2 save
sudo pm2 startup systemd
```

So, putting it all together, if you:

- use Ubuntu Server
- use a Let's Encrypt certificate for TLS
- want to serve user directories out of a custom folder
- want to use a cluster of 8 worker processes
- want to have the server load on startup

You'd do this (replacing example.com with your domain, and the path at the end with your server root path).

```sh
sudo apt install libpam0g-dev nodejs npm
sudo npm i -g npm n
sudo n 16
sudo npm i -g nephele-serve pm2

sudo pm2 start -i 8 -u root --uid 0 nephele-serve --node-args "--experimental-specifier-resolution=node" -- --user-directories --cert /etc/letsencrypt/live/example.com/fullchain.pem --key /etc/letsencrypt/live/example.com/privkey.pem /path/to/your/data/directory/

sudo pm2 save
sudo pm2 startup systemd
```

# Help

```sh
nephele-serve --help
```

Here's a copy of the help output:

```
Usage: nephele-serve [options] [directory]

Run Nephele WebDAV server to serve local files.

Arguments:
  directory                        The path of the directory to use as the server root.

Options:
  -v, --version                    Print the current version
  -h, --host <host>                A host address to listen on. The default is to listen on all hosts. (default: "::")
  -r, --realm <realm>              The realm reported to the user by the server when authentication is requested. Defaults to the system hostname.
  --cert <cert_file>               The filename of a certificate to use for HTTPS in PEM format.
  --key <key_file>                 The filename of a private key to use for HTTPS in PEM format.
  -p, --port <port>                The port to listen on. Defaults to 443 if a cert is provided, 80 otherwise.
  --redirect-port <redirect_port>  The port to redirect HTTP traffic to HTTPS. Set this to 80 if you want to redirect plain HTTP requests.
  --home-directories               Serve users' home directories to them when they log in.
  --user-directories               Serve users their own directory under the server root when they log in.
  --serve-indexes                  Serve index.html and index.htm files when the user requests a directory.
  --serve-listings                 Serve directory listings with file management forms when the user requests a directory.
  --no-auth                        Don't require authorization. (Not compatible with serving home directories or user directories.)
  --help                           display help for command

Environment Variables:
  HOST                 Same as --host.
  PORT                 Same as --port.
  REDIRECT_PORT        Same as --redirect-port.
  REALM                Same as --realm.
  CERT_FILE            Same as --cert.
  CERT                 Text of a cert in PEM format.
  KEY_FILE             Same as --key.
  KEY                  Text of a key in PEM format.
  HOME_DIRECTORIES     Same as --home-directories when set to "true", "on" or "1".
  USER_DIRECTORIES     Same as --user-directories when set to "true", "on" or "1".
  SERVE_INDEXES        Same as --serve-indexes when set to "true", "on" or "1".
  SERVE_LISTINGS       Same as --serve-listings when set to "true", "on" or "1".
  AUTH                 Same as --no-auth when set to "false", "off" or "0".
  SERVER_ROOT          Same as [directory].

Options given on the command line take precedence over options from an environment variable.

Nephele repo: https://github.com/sciactive/nephele
Copyright (C) 2022-2023 SciActive, Inc
https://sciactive.com/
```

# Node Warning

If you see this warning:

```
(node:319632) ExperimentalWarning: The Node.js specifier resolution flag is experimental. It could change or be removed at any time.
(Use `node --trace-warnings ...` to show where the warning was created)
```

Don't worry, it's because the script is using `--experimental-specifier-resolution=node` to be able to load the PAM authentication module from an ES module.

# License

Copyright 2022-2023 SciActive Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
