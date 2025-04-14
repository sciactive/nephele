# File System Nephele Adapter

A Nephele adapter that uses the file system as the storage backend.

# Installation

```sh
npm i -s @nephele/adapter-file-system
```

# Usage

The default export is the adapter, and it's also a named export "Adapter". Instantiate this class, providing an options object, and give that to Nephele as the adapter.

```js
import express from 'express';
import nepheleServer from 'nephele';
import FileSystemAdapter from '@nephele/adapter-file-system';
import ExampleAuthenticator from '@nephele/authenticator-example';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new FileSystemAdapter({
      root: '/path/to/webdav/root',
    }),
    authenticator: new ExampleAuthenticator(),
  }),
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

# Options / Defaults

- `root`: The absolute path of the directory that acts as the root directory for the service.
- `contentEtagMaxBytes` = `-1`: The maximum filesize in bytes to calculate etags by a CRC-32C checksum of the file contents.

## contentEtagMaxBytes

Any files above this file size will use an etag of a CRC-32C checksum of the size, created time, and modified time. This will significantly speed up responses to requests for these files, but at the cost of reduced accuracy of etags. A file that has the exact same content, but a different modified time will not be pulled from cache by the client.

- Set this value to `Infinity` if you wish to fully follow the WebDAV spec to the letter.
- Set this value to `-1` if you want to absolutely minimize disk IO.

By default, all etags will be based on file size, created date, and modified date, since this only requires retrieving metadata from the file system, which is very fast compared to actually retrieving file contents. This could technically go against the WebDAV spec section 8.8, which reads, 'For any given URL, an "ETag" value MUST NOT be reused for different representations returned by GET.' A file the exact same size and exact same created and modified dates with different contents, though extremely unlikely, would return the same etag.

# Properties and Locks

WebDAV properties and locks are stored in ".nephelemeta" files. For directories, it's a file in the directory named ".nephelemeta", and for files, it's a file with the same name and the extension ".nephelemeta".

# License

Copyright 2022-2025 SciActive Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
