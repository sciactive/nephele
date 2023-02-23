# Nephele - Insecure Authenticator

A Nephele authenticator that allows **unrestricted access** to all users.

# Installation

```sh
npm i -s @nephele/authenticator-none
```

# Security Implications

If you use this authenticator, anyone who can reach your server on the network will have full access to create, read, update, and delete all resources!

# Usage

The default export is the authenticator, and it's also a named export "Authenticator". Instantiate this class, and give that to Nephele as the authenticator.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import InsecureAuthenticator from '@nephele/authenticator-none';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new InsecureAuthenticator(),
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

# License

Copyright 2022-2023 SciActive Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
