# Nymph Nephele Authenticator

A Nephele authenticator that uses [Nymph.js](https://nymph.io/) (with Tilmeld) to authenticate users.

# Installation

```sh
npm i -s @nephele/authenticator-nymph
```

# Usage

The default export is the authenticator, and it's also a named export "Authenticator". Instantiate this class, providing an options object, and give that to Nephele as the authenticator.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import NymphAuthenticator, { User } from '@nephele/authenticator-nymph';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new NymphAuthenticator({
      nymph: myNymphInstance,
      realm: 'My WebDAV Server',
    }),
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

One important note is that this authenticator merely authenticates the Nephele request. It **does not** fill the user session on the Tilmeld instance.

# Options / Defaults

- `realm` = `'Nephele WebDAV Service'`: The realm is the name reported by the server when the user is prompted to authenticate.
- `nymph`: The instance of Nymph that will authenticate the users. This must have Tilmeld loaded.

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
