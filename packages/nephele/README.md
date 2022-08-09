# Nephele - Server Middleware

A pluggable WebDAV, CardDAV, and CalDAV server for Node.js and Express.

# Work in Progress

Nephele is currently a work in progress. It fully implements the WebDAV spec (RFC4918), but there are [still more RFCs planned](https://github.com/sciactive/nephele/blob/master/README.md#planned-rfcs) for version 1.0.

It is being actively developed by [SciActive Inc](https://sciactive.com/) for use in [Port87](https://port87.com/).

# Installation

```sh
npm i -s nephele
```

# Usage

Nephele provides all of the business logic of implementing WebDAV, but it requires [an adapter](https://www.npmjs.com/search?q=keywords%3Anephele%20adapter) to store and serve resources from a storage backend, and [an authenticator](https://www.npmjs.com/search?q=keywords%3Anephele%20authenticator) to authenticate users.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import ExampleAuthenticator from '@nephele/authenticator-example';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new ExampleAuthenticator(),
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

You can also provide options as a second argument to the create server function.

# Adapters

Nephele handles data storage, retrieval, and manipulation by using [adapters](https://www.npmjs.com/search?q=keywords%3Anephele%20adapter). An adapter is responsible for actually performing changes in the storage backend, while Nephele is responsible for implementing the WebDAV spec on top of Express.

## Resources

Resources are the meat of WebDAV. They represent an item on your server. This could be a directory, a file, a contact card, etc. Non-collection resources generally have a bytestream as content, and that bytestream is what the Resource class is responsible for reading and manipulating.

### Collections

Collection resources represent a container of other resources. This could be a directory, an address book, etc. Collection resources generally don't have a bytestream, but they still have properties.

## Properties

Properties are the metadata associated with resources. Live properties are data that is generally derived from the content of the resource or actions of the user. These include creation date, modified date, size, etc. They are generally managed by the server. Dead properties (don't blame me, I didn't come up with the name) are managed by the client. The server only stores them.

# Authenticators

Nephele handles access control by using [authenticators](https://www.npmjs.com/search?q=keywords%3Anephele%20authenticator). An authenticator is responsible for authenticating the HTTP request and providing a user to Nephele and the adapter.

## Users

Users are extremely flexible in Nephele. Basically Nephele hands your authenticator a request, and you provide whatever you like back as the user for that request. Later, when Nephele asks you to do certain things, it will provide this same user back to you.

# Service Location for CardDAV and CalDAV Clients

You should read and follow this RFC to make your server work well with CardDAV and CalDAV clients:

[Locating Services for Calendaring Extensions to WebDAV (CalDAV) and vCard Extensions to WebDAV (CardDAV)](https://datatracker.ietf.org/doc/html/rfc6764)

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
