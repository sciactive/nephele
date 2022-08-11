# Nephele - Custom Authenticator

A Nephele authenticator that uses customizable logic to authenticate users.

# Installation

```sh
npm i -s @nephele/authenticator-custom
```

# Usage

The default export is the authenticator, and it's also a named export "Authenticator". Instantiate this class, providing an options object, and give that to Nephele as the authenticator.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import CustomAuthenticator, { User } from '@nephele/authenticator-custom';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new CustomAuthenticator({
      auth: async (username, password) => {
        if (username === 'admin' && password === 'password') {
          const user = new User({ username });
          user.someArbitraryPropYouMayNeed = 'somevalue';
          return user;
        }

        return null;
      },
      realm: 'My WebDAV Server',
    }),
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

# Options / Defaults

- `auth`: A function that takes a username and password and returns a promise that resolves to a user if the authentication succeeds, or null otherwise.
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
