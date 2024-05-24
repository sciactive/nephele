# Nymph Nephele Adapter

A Nephele adapter that uses [Nymph.js](https://nymph.io/) and the file system to store and deduplicate files.

# Installation

```sh
npm i -s @nephele/adapter-nymph
```

# Usage

The default export is the adapter, and it's also a named export "Adapter". Instantiate this class, providing an options object, and give that to Nephele as the adapter.

```js
import express from 'express';
import nepheleServer from 'nephele';
import NymphAdapter from '@nephele/adapter-nymph';
import ExampleAuthenticator from '@nephele/authenticator-example';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new NymphAdapter({
      root: '/path/to/webdav/root',
    }),
    authenticator: new ExampleAuthenticator(),
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

## Disconnecting from DB

If you instantiate the adapter for every request, and you don't provide the Nymph instance, you will have a memory leak. If you must do this, you should disconnect Nymph on response close.

```js
response.on('close', async () => {
  await nymphAdapter.nymph.disconnect();
});
```

# Options / Defaults

- `root`: The absolute path of the directory that acts as the root directory for the service.
- `nymph` = `undefined`: The instance of Nymph that will manage the data.
- `getRootResource` = `Function`: A function to get the root resource of the namespace.

## nymph

If you do not provide one, a Nymph instance will be created that uses a SQLite3 database in the file root called "nephele.db".

## getRootResource

The default implementation will look for a collection Resource without a parent. If one isn't found, one will be created with a UUIDv4 as a name.

This does pose an issue if the user has read access to multiple root resources. The first one found will be used. If this is not acceptible, you must provide your own implementation.

# How it Works

When you upload a file to Nephele with this adapter, the metadata for the file (filename, directory, content-type, creation and modified dates, etc) are stored in a Nymph database. By default, that is a SQLite3 database in the root directory.

The file _contents_ however, are stored in a temporary file during upload and the SHA-384 hash sum is calculated. Once the upload is completed, the file is moved to the blob directory and named after its hash. This process automatically deduplicates files, because the file will overwrite a previously uploaded file with the same contents. This is a non-destructive act, since both files have the same contents, so no data is lost.

When a file is deleted, the adapter will check for any other files that share the same hash (duplicate files). If none are found, only then will the actual file blob be deleted.

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
