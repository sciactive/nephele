# Index Nephele Plugin

A Nephele plugin to serve index files and list directory contents.

# Installation

```sh
npm i -s @nephele/plugin-index
```

# Usage

The default export is the plugin, and it's also a named export "Plugin". Instantiate this class, and give that to Nephele as a plugin.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import ExampleAuthenticator from '@nephele/authenticator-example';
import IndexPlugin from '@nephele/plugin-index';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new ExampleAuthenticator(),
    plugins: [
      new IndexPlugin({
        name: 'Nephele Server',
      }),
    ],
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

The plugin, by default, will serve the "index.html" or "index.htm" file (if it exists) when a request for the directory is made. If no such file exists, by default, the plugin will serve a directory listing page with upload/file management forms.

# Options / Defaults

- `name` = `'Nephele Server'`: The name of the server reported on the directory listing pages.
- `serveIndexes` = `true`: Whether to serve "index.html" and "index.htm" files when a GET request for a directory is made.
- `serveListings` = `true`: Whether to serve directory listings when a request to a directory is made.
- `showForms` = `true`: Whether to show file management forms on directory listings.

## serveListings

If the user has access to create/modify/delete files in the directory, the listing page will include forms to do those tasks (if showForms is not false).

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
