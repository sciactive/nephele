<div align="center"><img alt="Nephele" src="assets/logo.png" /></div>

Nephele: A pluggable WebDAV (and soon CardDAV and CalDAV) server for Node.js and Express.

# Nephele Serve

If you are looking for a ready-to-run dedicated WebDAV server, check out the [nephele-serve package](https://www.npmjs.com/package/nephele-serve) on NPM or the [Nephele Docker image](https://hub.docker.com/r/sciactive/nephele) on Docker Hub.

# QuickDAV

If you're looking for an easy to use desktop app for local file transfers, check out [QuickDAV](https://sciactive.com/quickdav/) for Windows, macOS, and Linux.

# What is WebDAV

WebDAV (Web Distributed Authoring and Versioning) is a protocol that allows users to access and manage files stored on a remote server. It is commonly used for web-based file sharing and collaboration, as it allows users to upload, download, and manage files directly from a web browser or file manager.

WebDAV is based on HTTP (Hypertext Transfer Protocol) and uses the same basic communication methods, but adds additional features and functionality specifically designed for file management. These features include support for file locking, collections, and metadata.

# Compliance

Nephele focuses on strict compliance with the implemented protocols. The specifications (RFCs) include [keywords](https://www.rfc-editor.org/rfc/rfc2119) which determine what behavior is required to be fully compliant. Nephele follows all behaviors described as "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", and "NOT RECOMMENDED". Unless otherwise stated in an adapter's or authenticator's readme, the official adapters and authenticators also follow these behaviors.

If you find behavior in Nephele or the official adapters/authenticators that does not align with behavior described in the spec using the aforementioned keywords, this should be considered a bug, and a bug report in this repository would be greatly appreciated.

# Performance

Nephele also prioritizes performance and stability. Nephele aims to minimize disk IO and memory usage. Nephele is already production ready, and aims to perform as well as or better than any other WebDAV server.

# Work in Progress

Nephele is currently a work in progress. You can [install](https://www.npmjs.com/package/nephele) and [run](https://www.npmjs.com/package/nephele-serve) it, but building adapters and authenticators for it is not recommended yet, because the API may significantly change before the 1.0 release.

It is being actively developed by [SciActive Inc](https://sciactive.com/) for use in [Port87](https://port87.com/).

# RFCs

## Implemented RFCs

### WebDAV

- [HTTP Extensions for Web Distributed Authoring and Versioning (WebDAV)](https://datatracker.ietf.org/doc/html/rfc4918)

## Planned RFCs

Nephele will hopefully eventually support the following RFCs. I've included how likely version 1.0 is to support each RFC.

### WebDAV

- [Web Distributed Authoring and Versioning (WebDAV) Access Control Protocol](https://datatracker.ietf.org/doc/html/rfc3744) (in progress)
- [WebDAV Current Principal Extension](https://datatracker.ietf.org/doc/html/rfc5397) (definitely)
- [Extended MKCOL for Web Distributed Authoring and Versioning (WebDAV)](https://datatracker.ietf.org/doc/html/rfc5689) (definitely)
- [Web Distributed Authoring and Versioning (WebDAV) SEARCH](https://datatracker.ietf.org/doc/html/rfc5323) (probably not)

### CardDAV

- [CardDAV: vCard Extensions to Web Distributed Authoring and Versioning (WebDAV)](https://datatracker.ietf.org/doc/html/rfc6352) (definitely)

### CalDAV

- [Calendaring Extensions to WebDAV (CalDAV)](https://datatracker.ietf.org/doc/html/rfc4791) (maybe)
- [Scheduling Extensions to CalDAV](https://datatracker.ietf.org/doc/html/rfc6638) (probably not)
- [Calendaring Extensions to WebDAV (CalDAV): Time Zones by Reference](https://datatracker.ietf.org/doc/html/rfc7809) (probably not)
- [Calendar Availability](https://datatracker.ietf.org/doc/html/rfc7953) (probably not)

## Service Location for CardDAV and CalDAV Clients

Once CardDAV and CalDAV are implemented, you should read and follow this RFC to make your server work well with CardDAV and CalDAV clients:

[Locating Services for Calendaring Extensions to WebDAV (CalDAV) and vCard Extensions to WebDAV (CardDAV)](https://datatracker.ietf.org/doc/html/rfc6764)

# Testing

To bring up the testing server, run the `testserver.ts` file, like this.

```
mkdir testroot
env DEBUG="nephele:*" NODE_OPTIONS='--experimental-specifier-resolution=node' npx tsx testserver.ts testroot
```

If you want to run it without PAM authentication (allow unrestricted access to any user who can reach your host on the network), set the `NOPAM` env var, like this.

```
env NOPAM=true DEBUG="nephele:*" NODE_OPTIONS='--experimental-specifier-resolution=node' npx tsx testserver.ts testroot
```

You can also run the `nephele-serve` script like this.

```
./packages/nephele-serve/nephele-serve.cjs --no-auth -p 8080 ./testroot/
```

## S3

Nephele uses the MinIO S3 compatible object storage server for testing. To bring it up with Docker, run this.

```
docker compose -f testserver-docker-compose.yml up -d
```

Then use the MinIO console at http://127.0.0.1:9001 to create a bucket called "nephele". The username and password are both "minioadmin".

Then bring up the Nephele test server like this.

```
env S3ENDPOINT="http://127.0.0.1:8081" S3ACCESSKEY="minioadmin" S3SECRETKEY="minioadmin" S3BUCKET="nephele" NOPAM=true USERNAME="admin" PASSWORD="password" DEBUG="nephele:*" NODE_OPTIONS='--experimental-specifier-resolution=node' npx tsx testserver.ts
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
