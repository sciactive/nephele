# Nephele - Index Plugin

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
import InsecureAuthenticator from '@nephele/authenticator-none';
import IndexPlugin from '@nephele/plugin-index';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new InsecureAuthenticator(),
    plugins: [new IndexPlugin()],
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

The plugin, by default, will server the "index.html" or "index.htm" file (if it exists) when a request for the directory is made. If no such file exists, by default the plugin will serve a directory listing with an upload form.

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