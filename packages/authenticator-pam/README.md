# Nephele - PAM Authenticator

A Nephele authenticator that uses PAM (system users) as its authentication backend.

# Installation

```sh
npm i -s @nephele/authenticator-pam
```

# Usage

The default export is the authenticator, and it's also a named export "Authenticator". Instantiate this class, providing an options object if needed, and give that to Nephele as the authenticator.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import PamAuthenticator from '@nephele/authenticator-pam';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new PamAuthenticator({ realm: 'My WebDAV Server' }),
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

# Requirements

Read the details on https://www.npmjs.com/package/authenticate-pam, which is used for the actual PAM authentication.

Specifically, you may need to use `NODE_OPTIONS='--experimental-specifier-resolution=node'` when you launch your server.

# Options / Defaults

- `realm` = `'Nephele WebDAV Service'`: The realm is the name reported by the server when the user is prompted to authenticate.

## realm

It should be HTTP header safe (shouldn't include double quotes or semicolon).

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
