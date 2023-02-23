# Custom Nephele Authenticator

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
      getUser: async (username) => {
        if (username === 'admin') {
          const user = new User({ username });
          user.someArbitraryPropYouMayNeed = 'somevalue';
          return user;
        }
        return null;
      },
      // For Basic authentication.
      authBasic: async (user, password) => {
        if (user.username === 'admin' && password === 'password') {
          return true;
        }
        return false;
      },
      // For Digest authentication.
      authDigest: async (user) => {
        if (user.username === 'admin') {
          return { password: 'password' };
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

- `realm` = `'Nephele WebDAV Service'`: The realm is the name reported by the server when the user is prompted to authenticate.
- `unauthorizedAccess` = `false`: Allow the user to proceed, even if they are not authenticated.
- `getUser`: A function that takes a username and returns a promise that resolves to a user if the user exists or it's not possible to tell whether they exist, or null otherwise.
- `key` = `random_uuid()`: A private key used to calculate nonce values for Digest authentication.
- `nonceTimeout` = `1000 * 60 * 60 * 6`: The number of milliseconds for which a nonce is valid once issued. Defaults to 6 hours.
- `authBasic`: Authorize a User returned by `getUser` with a password.
- `authDigest`: Retrieve a User's password or hash for Digest authentication.

## realm

It should be HTTP header safe (shouldn't include double quotes or semicolon).

## unauthorizedAccess

The authenticator will advertise that authentication is available, but the user will have access to the server without providing authentication.

In the unauthorized state, the `user` presented to the Nephele adapter will have the username "nobody".

WARNING: It is very dangerous to allow unauthorized access if write actions are allowed!

## key

If you do not provide one, one will be generated, but this does mean that with Digest authentication, clients will only be able to authenticate to _that_ particular server. If you have multiple servers or multiple instances of Nephele that serve the same source data, you should provide the same key to all of them in order to use Digest authentication correctly.

## authBasic

The returned promise should resolve to true if the user is successfully authenticated, false otherwise.

The Basic mechanism requires the user to submit their username and password in plain text with the request, so only use this if the connection is secured through some means like TLS. If you provide `authBasic`, the server will advertise support for the Basic mechanism.

## authDigest

The returned promise should resolve to the password or hash if the user exists, or null otherwise. If the password is returned, it will be hashed, however, you can also return a prehashed string of SHA256(username:realm:password) or MD5(username:realm:password), depending on the requested algorithm.

The Digest mechansism requires the user to cryptographically hash their password with the request, so it will not divulge their password to eaves droppers. However, it is still less safe than using TLS and Basic authentication. If you provide `authDigest`, the server will advertise support for the Digest mechanism.

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
