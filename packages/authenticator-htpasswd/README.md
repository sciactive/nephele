# Apache htpasswd Based Nephele Authenticator

A Nephele authenticator that uses htpasswd files.

# Installation

```sh
npm i -s @nephele/authenticator-htpasswd
```

# Usage

The default export is the authenticator, and it's also a named export "Authenticator". Instantiate this class, providing an options object, and give that to Nephele as the authenticator.

Please note that this authenticator only works with "Basic" authentication, and any password stored in the htpasswd file in "digest" format will be ignored.

For information on how to create .htpasswd files, see [here](https://httpd.apache.org/docs/current/programs/htpasswd.html).

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import HtpasswdAuthenticator from '@nephele/authenticator-htpasswd';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new HtpasswdAuthenticator({
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

# Options / Defaults

- `realm` = `'Nephele WebDAV Service'`: The realm is the name reported by the server when the user is prompted to authenticate.
- `unauthorizedAccess` = `false`: Allow the user to proceed, even if they are not authenticated.
- `authUserFilename` = `'.htpasswd'`: htpasswd filename.
- `authUserFile` = `undefined`: A specific htpasswd file to use for every request.
- `blockAuthUserFilename` = `true`: Block access to the htpasswd file(s) that match `authUserFilename`.

## realm

It should be HTTP header safe (shouldn't include double quotes or semicolon).

## unauthorizedAccess

The authenticator will advertise that authentication is available, but the user will have access to the server without providing authentication.

In the unauthorized state, the `user` presented to the Nephele adapter will have the username "nobody".

WARNING: It is very dangerous to allow unauthorized access if write actions are allowed!

## authUserFilename

This file must be accessible to the adapter that is mounted when the user has not yet been authenticated.

For every request, the root directory is searched for this file, then each directory in turn down to the directory of the request. Whichever file is found first is what will be used. (Eg, if /dir/ contains a file with only username "bob", and /dir/sub/ contains a file with username "jane", user "jane" not be able to access either directory, and user "bob" will be able to access both.)

## authUserFile

If this filename is given, it points to the htpasswd file used to authenticate every request.

## blockAuthUserFilename

This is important, because a user with access to the file could add any other users they wanted to the file. If you have some setup that guarantees the htpasswd file used is not accessible to the adapter managing files, you don't need this.

This is not the only risk with htpasswd files! If a user has the ability to move or delete a directory, and the directory contains the htpasswd file, they could do nefarious things. You should consider the implications of giving a user access to manage the directory that their htpasswd file is stored in.

If you are using `authUserFile`, this option is ignored.

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
