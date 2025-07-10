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
    adapter: new FileSystemAdapter({ root: '/path/to/webdav/root' }),
    authenticator: new ExampleAuthenticator(),
  }),
);

app.listen(port, (err) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

# Options / Defaults

- `root`: The absolute path of the directory that acts as the root directory for the service.
- `followLinks` = `true`: Whether to follow symlinks.
- `properties` = `'meta-files'`: How to handle client requested properties.
- `locks` = `'meta-files'`: How to handle client requested locks.
- `contentEtagMaxBytes` = `-1`: The maximum filesize in bytes to calculate etags by a CRC-32C checksum of the file contents.

## properties

The client can request to add any arbitrary property it wants (the WebDAV spec calls these "dead properties"), and this controls how that situation is handled.

- "meta-files": Save these properties in ".nephelemeta" files.
- "disallow": Refuse to save them and return an error to the client.
- "emulate": Don't actually save them, but return a success to the client.

"meta-files" is the default, as the WebDAV spec states that WebDAV servers "should" support setting these properties. However, if you don't want meta files cluttering up your file system, you can make a choice:

"disallow" will tell the client that any property it tries to set is protected. A well written client will understand this and move on.

"emulate" will tell the client that the property was successfully set, even though it wasn't really. If a client is poorly written and can't handle an error on property setting, this will allow Nephele to still work with that client.

This setting does not affect "live properties", like last modified date and content length.

## locks

This works the same as "properties", except that "disallow" also causes Nephele to report to the client that locks are not supported at all.

Again, a poorly written WebDAV client may require "emulate" to work with Nephele.

## contentEtagMaxBytes

Any files above this file size will use an etag of a CRC-32C checksum of the size, created time, and modified time. This will significantly speed up responses to requests for these files, but at the cost of reduced accuracy of etags. A file that has the exact same content, but a different modified time will not be pulled from cache by the client.

- Set this value to `Infinity` if you wish to fully follow the WebDAV spec to the letter.
- Set this value to `-1` if you want to absolutely minimize disk IO.

By default, all etags will be based on file size, created date, and modified date, since this only requires retrieving metadata from the file system, which is very fast compared to actually retrieving file contents. This could technically go against the WebDAV spec section 8.8, which reads, 'For any given URL, an "ETag" value MUST NOT be reused for different representations returned by GET.' A file the exact same size and exact same created and modified dates with different contents, though extremely unlikely, would return the same etag.

# Properties and Locks

By default, WebDAV properties and locks are stored in ".nephelemeta" files. For directories, it's a file in the directory named ".nephelemeta", and for files, it's a file with the same name and the extension ".nephelemeta".

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
