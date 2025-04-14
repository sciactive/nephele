# Virtual File Nephele Adapter

A Nephele adapter that serves virtual files from memory.

# Installation

```sh
npm i -s @nephele/adapter-virtual
```

# Usage

The default export is the adapter, and it's also a named export "Adapter". Instantiate this class, providing an options object, and give that to Nephele as the adapter.

```js
import express from 'express';
import nepheleServer from 'nephele';
import VirtualAdapter from '@nephele/adapter-virtual';
import ExampleAuthenticator from '@nephele/authenticator-example';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new VirtualAdapter({
      files: {
        properties: {
          creationdate: new Date(),
          getlastmodified: new Date(),
          owner: 'root',
        },
        locks: {},
        children: [
          {
            name: "someuser's stuff",
            properties: {
              creationdate: new Date(),
              getlastmodified: new Date(),
              owner: 'someuser',
            },
            locks: {},
            children: [
              {
                name: 'example.txt',
                properties: {
                  creationdate: new Date(),
                  getlastmodified: new Date(),
                  owner: 'someuser',
                },
                locks: {},
                content: Buffer.from('Hello, world.'),
              },
            ],
          },
        ],
      },
    }),
    authenticator: new ExampleAuthenticator(),
  }),
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

If you're using the insecure authenticator, setting the `owner` of a resource to `"nobody"` will make it editable. If you're using the PAM authenticator, setting the `owner` to `"root"` will make it read-only.

# Options / Defaults

- `files`: The root file entry to serve from the virtual adapter.

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
