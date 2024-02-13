# Nephele WebDAV Server Middleware

A pluggable WebDAV (and soon CardDAV and CalDAV) server for Node.js and Express.

Nephele, the free and open source WebDAV server framework for Node.js, is designed to make it easy to develop and integrate WebDAV functionality into your Node.js applications.

WebDAV (Web Distributed Authoring and Versioning) is a powerful and flexible protocol that allows users to access and manage files over the web. With Nephele, you can easily add WebDAV support to your Node.js applications, allowing your users to upload, download, and edit files directly from their web browser or file manager.

Nephele is free and open source, so you can use it, modify it, and distribute it as you see fit. It is released under the Apache-2.0 license, which allows you to use it for any purpose, including commercial projects.

# Nephele Serve

If you are looking for a ready-to-run dedicated WebDAV server, check out the [nephele-serve package](https://www.npmjs.com/package/nephele-serve) on NPM or the [Nephele Docker image](https://hub.docker.com/r/sciactive/nephele) on Docker Hub.

# QuickDAV

If you're looking for an easy to use desktop app for local file transfers, check out [QuickDAV](https://sciactive.com/quickdav/) for Windows, macOS, and Linux.

# Work in Progress

Nephele is currently a work in progress. It fully implements the WebDAV spec (RFC4918), but there are [still more RFCs planned](https://github.com/sciactive/nephele/blob/master/README.md#planned-rfcs) for version 1.0.

It is being actively developed by [SciActive Inc](https://sciactive.com/) for use in [Port87](https://port87.com/).

# Installation

```sh
npm i -s nephele
```

# Usage

Nephele provides all of the business logic of implementing WebDAV, but it requires [an adapter](https://www.npmjs.com/search?q=keywords%3Anephele%20adapter) to store and serve resources from a storage backend, and [an authenticator](https://www.npmjs.com/search?q=keywords%3Anephele%20authenticator) to authenticate users. It also can use [plugins](https://www.npmjs.com/search?q=keywords%3Anephele%20plugin) to provide additional features.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import ExampleAuthenticator from '@nephele/authenticator-example';
import ExamplePluginA from '@nephele/plugin-example-a';
import ExamplePluginB from '@nephele/plugin-example-b';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new ExampleAuthenticator(),
    plugins: [new ExamplePluginA(), new ExamplePluginB()],
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

You can also provide options as a second argument to the Nephele server function.

## Request Timeout

Node.js has a default request timeout for HTTP(S) servers of 5 minutes. This limits the size of files you can upload/download. If this is not acceptable, you can change the request timeout of the server by using the `node:http` or `node:https` imports and setting `server.requestTimeout`.

```js
import https from 'node:https';
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import ExampleAuthenticator from '@nephele/authenticator-example';
import ExamplePluginA from '@nephele/plugin-example-a';
import ExamplePluginB from '@nephele/plugin-example-b';

const app = express();
const port = 8080;
const cert = process.env.CERT;
const key = process.env.KEY;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new ExampleAuthenticator(),
    plugins: [new ExamplePluginA(), new ExamplePluginB()],
  })
);

const server = https.createServer({ cert, key }, app).listen(port);

server.requestTimeout = 1800000; // 30 minutes in milliseconds

server.on('listening', () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

## Conditional Adapters, Authenticators, and Plugins

You can load conditional adapters, authenticators, and plugins by providing a function that returns them instead.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleUnauthorizedAdapter from '@nephele/adapter-example-unauthorized';
import ExampleAuthorizedAdapter from '@nephele/adapter-example-authorized';
import ExampleAuthenticator from '@nephele/authenticator-example';
import ExamplePlugin from '@nephele/plugin-example';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: async (_request, response) => {
      if (response.locals.user == null) {
        // This adapter will be used when the user hasn't authenticated.
        return new ExampleUnauthorizedAdapter();
      }

      // This adapter will be used once the user is authenticated.
      return new ExampleAuthorizedAdapter({
        username: response.locals.user.username,
      });
    },

    authenticator: new ExampleAuthenticator(),

    plugins: async (_request, response) => {
      if (response.locals.user == null) {
        return [new ExamplePlugin()];
      }

      return [];
    },
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

# Mounted Adapters, Authenticators, and Plugins

You can mount adapters, authenticators, and plugins to different points in the namespace by providing an object whose keys are the mount points instead. There must always be an adapter and authenticator mounted at the "/" mount point. Don't reuse plugin instances in multiple mount points; instead, instantiate the plugin each time it is mounted (because the plugin is provided the mount point as its base URL).

```js
import express from 'express';
import nepheleServer from 'nephele';
import VirtualAdapter from '@nephele/adapter-virtual';
import ExampleAdapter from '@nephele/adapter-example';
import AnotherAdapter from '@nephele/adapter-another';
import InsecureAuthenticator from '@nephele/authenticator-none';
import ExampleAuthenticator from '@nephele/authenticator-example';
import AnotherAuthenticator from '@nephele/authenticator-another';
import ExamplePlugin from '@nephele/plugin-example';
import AnotherPlugin from '@nephele/plugin-another';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: {
      '/': new VirtualAdapter({
        files: {
          properties: {
            creationdate: new Date(),
            getlastmodified: new Date(),
            owner: 'root',
          },
          locks: {},
          children: [
            {
              name: 'Some Directory',
              properties: {
                creationdate: new Date(),
                getlastmodified: new Date(),
                owner: 'root',
              },
              locks: {},
              children: [],
            },
            {
              name: 'Another Directory',
              properties: {
                creationdate: new Date(),
                getlastmodified: new Date(),
                owner: 'root',
              },
              locks: {},
              children: [],
            },
          ],
        },
      }),
      '/Some Directory/': new ExampleAdapter(),
      '/Another Directory/': new AnotherAdapter(),
    },

    authenticator: {
      '/': new InsecureAuthenticator(),
      '/Some Directory/': new ExampleAuthenticator(),
      '/Another Directory/': new AnotherAuthenticator(),
    },

    plugins: {
      '/Some Directory/': [new ExamplePlugin()],
      '/Another Directory/': [new AnotherPlugin()],
    },
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

This object can also be returned from adapter, authenticator, and plugins functions.

# How it Works

Nephele implements the WebDAV spec while being storage and authentication agnostic. It does this through a number of interfaces that, when implemented, allow Nephele to provide WebDAV functionality on top of any storage and authentication backends.

## Adapters

Nephele handles resource storage, listing, retrieval, and manipulation by using [adapters](https://www.npmjs.com/search?q=keywords%3Anephele%20adapter). An adapter is responsible for actually performing changes in the storage backend.

### Resources

Resources are the meat of WebDAV. They represent an item on your server. This could be a directory, a file, a contact card, etc. Non-collection resources generally have a bytestream as content, and that bytestream is what the Resource class is responsible for reading and manipulating.

#### Collections

Collection resources represent a container of other resources. This could be a directory, an address book, etc. Collection resources generally don't have a bytestream, but they still have properties.

### Properties

Properties are the metadata associated with resources. Live properties are data that is generally derived from the content of the resource or actions of the user. These include creation date, modified date, size, etc. They are generally managed by the server. Dead properties (don't blame me, I didn't come up with the name) are managed by the client. The server only stores them.

## Authenticators

Nephele handles access control by using [authenticators](https://www.npmjs.com/search?q=keywords%3Anephele%20authenticator). An authenticator is responsible for authenticating the HTTP request and providing a user for Nephele to give to the adapter.

### Users

Users are extremely flexible in Nephele. Basically Nephele hands your authenticator a request, and you provide whatever you like back as the user for that request. Later, when Nephele asks the adapter to do certain things, it will provide this user to it.

## Plugins

Nephele offers additional features using [plugins](https://www.npmjs.com/search?q=keywords%3Anephele%20plugin). A plugin is given the chance to alter the behavior and response throughout [the lifecycle of a Nephele request](src/Interfaces/Plugin.ts).

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
