# Nephele

A pluggable WebDAV, CardDAV, and CalDAV server for Node.js and Express.

# Work in Progress

Nephele is currently a work in progress. It fully implements the WebDAV spec (RFC4918), but there are still more RFCs planned for version 1.0.

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

# Service Location for CardDAV and CalDAV Clients

You should read and follow this RFC to make your server work well with CardDAV and CalDAV clients:

[Locating Services for Calendaring Extensions to WebDAV (CalDAV) and vCard Extensions to WebDAV (CardDAV)](https://datatracker.ietf.org/doc/html/rfc6764)

# Usage

Nephele provides all of the business logic of implementing WebDAV for you, but it's your job to put things in place when Nephele needs you to. This is done through an adapter.

## Adapters

Nephele works by using adapters. An adapter is responsible for actually performing changes in the storage backend, while Nephele is responsible for implementing the WebDAV spec on top of Express.

There is an [example adapter](src/FileSystemAdapter/) provided by Nephele, but it is **not intended for production use**. It is provided for illustrative and testing purposes only.

## Resources

Resources are the meat of WebDAV. They represent an item on your server. This could be a directory, a file, a contact card, etc. Non-collection resources generally have a bytestream as content, and that bytestream is what the Resource class is responsible for reading and manipulating.

### Collections

Collection resources represent a container of other resources. This could be a directory, an address book, etc. Collection resources generally don't have a bytestream, but they still have properties.

## Properties

Properties are the metadata associated with resources. Live properties are data that is generally derived from the content of the resource or actions of the user. These include creation date, modified date, size, etc. They are generally managed by the server. Dead properties (don't blame me, I didn't come up with the name) are managed by the client. The server only stores them.

## Users

Users are extremely flexible in Nephele. Basically Nephele hands you a request, and you provide whatever you like back as the user for that request. Later, when Nephele asks you to do certain things, it will provide this same user back to you.

# Testing

To bring up the testing server, which you should never do in a production environment, run the `testserver.js` file, like this.

```
mkdir testroot
env DEBUG="nephele:*" node --experimental-specifier-resolution=node testserver.js testroot
```

If you want to run it without PAM authentication, set the `NOPAM` env var, like this.

```
env NOPAM=true DEBUG="nephele:*" node --experimental-specifier-resolution=node testserver.js testroot
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
