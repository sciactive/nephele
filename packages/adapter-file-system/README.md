# Nephele - File System Adapter

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
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

# Options / Defaults

- `root`: The absolute path of the directory that acts as the root directory for the service.
- `contentEtagMaxMB` = `100`: The maximum filesize in megabytes to calculate etags by a CRC-32C checksum of the file contents.

## contentEtagMaxMB

Anything above this file size will use a CRC-32C checksum of the size, created time, and modified time instead. This will significantly speed up responses to requests for these files, but at the cost of reduced accuracy of etags. A file that has the exact same content, but a different modified time will not be pulled from cache by the client.

- Set this value to `Infinity` if you wish to fully follow the WebDAV spec to the letter.
- Set this value to `-1` if you want to absolutely minimize disk IO.
- `100` is a good value for fast disks, like SSDs. If you are serving files from spinning hard disks or optical media, you should consider lowering this threshold.

# Properties and Locks

WebDAV properties and locks are stored in ".nephelemeta" files. For directories, it's a file in the directory named ".nephelemeta", and for files, it's a file with the same name and the extension ".nephelemeta".

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
