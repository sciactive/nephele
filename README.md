# Nephele

A pluggable WebDAV, CardDAV, and CalDAV server for Node.js and Express.

# Work in Progress

Nephele is currently a work in progress.

It is being actively developed by [SciActive Inc](https://sciactive.com/) for use in [Port87](https://port87.com/).

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

If you want to run it without PAM authentication, set the `NOPAM` env var, like this. (This will allow unrestricted access to any user who can reach your host on the network.)

```
env NOPAM=true DEBUG="nephele:*" NODE_OPTIONS='--experimental-specifier-resolution=node' npx ts-node --esm testserver.ts testroot
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
