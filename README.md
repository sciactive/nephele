# Nephele

A pluggable WebDAV, CardDAV, and CalDAV server for Node.js and Express.

# Work in Progress

Nephele is currently a work in progress. You can [install](https://www.npmjs.com/package/nephele) and [run](https://www.npmjs.com/package/nephele-serve) it, but building adapters and authenticators for it is not recommended yet, because it will significantly change before the 1.0 release.

It is being actively developed by [SciActive Inc](https://sciactive.com/) for use in [Port87](https://port87.com/) and [QuickDAV](https://sciactive.com/quickdav/).

# What is WebDAV

WebDAV (Web Distributed Authoring and Versioning) is a protocol that allows users to access and manage files stored on a remote server. It is commonly used for web-based file sharing and collaboration, as it allows users to upload, download, and edit files directly from a web browser.

WebDAV is based on HTTP (Hypertext Transfer Protocol) and uses the same basic communication methods, but adds additional features and functionality specifically designed for file management. These features include support for file locking, collections, and metadata.

WebDAV is a popular protocol for file sharing and collaboration, as it is easy to use and allows users to access their files from any device with an internet connection. It is also secure, with support for encrypted data transfer and authentication to prevent unauthorized access to files.

# Compliance

Nephele focuses on complete compliance with the implemented specifications. The specifications (RFCs) include [keywords](https://www.rfc-editor.org/rfc/rfc2119) which determine what behavior is required to be fully compliant. Nephele follows all behaviors described as "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", and "NOT RECOMMENDED". Unless otherwise stated in an adapter's or authenticator's readme, the official adapters and authenticators also follow these behaviors.

If you find behavior in Nephele or the official adapters/authenticators that does not align with behavior described in the spec using the aforementioned keywords, this should be considered a bug, and a bug report in this repository would be greatly appreciated.

# Implemented RFCs

## WebDAV

- [HTTP Extensions for Web Distributed Authoring and Versioning (WebDAV)](https://datatracker.ietf.org/doc/html/rfc4918)

# Planned RFCs

Nephele will hopefully eventually support the following RFCs. I've included how likely version 1.0 is to support the RFCs.

## WebDAV

- [Web Distributed Authoring and Versioning (WebDAV) Access Control Protocol](https://datatracker.ietf.org/doc/html/rfc3744) (in progress)
- [WebDAV Current Principal Extension](https://datatracker.ietf.org/doc/html/rfc5397) (definitely)
- [Extended MKCOL for Web Distributed Authoring and Versioning (WebDAV)](https://datatracker.ietf.org/doc/html/rfc5689) (definitely)
- [Web Distributed Authoring and Versioning (WebDAV) SEARCH](https://datatracker.ietf.org/doc/html/rfc5323) (probably not)

## CardDAV

- [CardDAV: vCard Extensions to Web Distributed Authoring and Versioning (WebDAV)](https://datatracker.ietf.org/doc/html/rfc6352) (definitely)

## CalDAV

- [Calendaring Extensions to WebDAV (CalDAV)](https://datatracker.ietf.org/doc/html/rfc4791) (maybe)
- [Scheduling Extensions to CalDAV](https://datatracker.ietf.org/doc/html/rfc6638) (probably not)
- [Calendaring Extensions to WebDAV (CalDAV): Time Zones by Reference](https://datatracker.ietf.org/doc/html/rfc7809) (probably not)
- [Calendar Availability](https://datatracker.ietf.org/doc/html/rfc7953) (probably not)

# Testing

To bring up the testing server, run the `testserver.ts` file, like this.

```
mkdir testroot
env DEBUG="nephele:*" NODE_OPTIONS='--experimental-specifier-resolution=node' npx ts-node --esm testserver.ts testroot
```

If you want to run it without PAM authentication (allow unrestricted access to any user who can reach your host on the network), set the `NOPAM` env var, like this.

```
env NOPAM=true DEBUG="nephele:*" NODE_OPTIONS='--experimental-specifier-resolution=node' npx ts-node --esm testserver.ts testroot
```

You can also run the `nephele-serve` script like this.

```
./packages/nephele-serve/nephele-serve.cjs --no-auth -p 8080 ./testroot/
```

# License

Copyright 2022 SciActive Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
