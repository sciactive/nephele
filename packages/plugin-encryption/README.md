# Encryption Nephele Plugin

A Nephele plugin to encrypt filenames and file contents (but not properties) at rest.

# Installation

```sh
npm i -s @nephele/plugin-encryption
```

# Usage

The default export is the plugin, and it's also a named export "Plugin". Instantiate this class, and give that to Nephele as a plugin.

```js
import express from 'express';
import nepheleServer from 'nephele';
import ExampleAdapter from '@nephele/adapter-example';
import ExampleAuthenticator from '@nephele/authenticator-example';
import EncryptionPlugin from '@nephele/plugin-encryption';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new ExampleAdapter(),
    authenticator: new ExampleAuthenticator(),
    plugins: [
      new EncryptionPlugin({
        exclude: ['**/.htpasswd'],
        salt: 'some-long-random-string',
      }),
    ],
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

Warning: The plugin uses the user's password from Basic authentication to create an encryption key. This means that if the user's password changes, their files will not be decryptable. It also means this plugin does not work with digest authentication.

# Options / Defaults

- `exclude` = `[]`: A list of glob patterns to exclude from the encryption/decryption process.
- `salt` = `'5de338e9a6c8465591821c4f5e1c5acf'`: The salt used with the passwords to generate encryption keys.

## salt

It should be a long random string. You can generate one with `npx uuid`.

# What is this plugin for?

This plugin provides [encryption at rest](https://phoenixnap.com/blog/encryption-at-rest). It is useful to protect your data from prying eyes who have access to your underlying data store. Take, for example, a Nephele server using Amazon S3 as its storage backend. Every Amazon employee who has administrator access to their S3 servers can access customer data stored on them. This plugin would prevent these employees from being able to read the filenames and file contents stored on their servers through the Nephele server.

Encryption at rest is also useful if your server becomes physically compromised. A malicious actor who steals your server's physical hardware would not be able to decrypt the data stored on it without the user passwords.

# What is this plugin not for?

This plugin does not provide [end-to-end encryption](https://en.wikipedia.org/wiki/End-to-end_encryption). That is to say, the server handles encrypting your data for you. When you send a request to the server, you include your password, which is necessary for encrypting and decrypting your data. Your data is then encrypted using your password before being stored in the storage backend. As such, if a malicious actor has administrator access to your server while you're using it, they can sniff the traffic coming into it, steal your password, and decrypt your data.

This plugin does not provide [encryption in transit](https://phoenixnap.com/blog/data-in-transit-encryption). Nephele natively supports [HTTPS](https://en.wikipedia.org/wiki/HTTPS), and you should use that feature for encryption in transit.

This plugin does not provide [deniable encryption](https://en.wikipedia.org/wiki/Deniable_encryption). Anyone with access to your files can see that they are encrypted, as well as their content lengths and the lengths of their filenames. This data _could_ be used to infer certain information about your files, but the likelihood that that would generate any usable information is extremely small.

This plugin requires a user password through [HTTP Basic authentication](https://en.wikipedia.org/wiki/Basic_access_authentication). As such, it cannot be used for any anonymously accessible namespaces, and will return a 403 Forbidden response when no credentials are provided. (This response will only occur if there is not an Authenticator configured on a namespace.)

# What encryption method is used?

For file contents, [AES-256](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard) is used in [Cipher Block Chaining](<https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation#Cipher_block_chaining_(CBC)>) mode. A random 16 byte initialization vector is generated for every file. This initialization vector, along with the length of any added padding, is stored in the properties of encrypted resources. The random initialization vector ensured that two files with exactly the same contents will still produce completely different ciphertext when encrypted.

AES-256 is a well tested encryption standard that is used extensively in the industry. Many CPUs have dedicated hardware to handle AES encryption and decryption. Cipher Block Chaining mode allows AES-256 to act more like a stream cipher, and also allows Nephele to answer Range requests (non-sequential read access) even for encrypted files. This means, for example, your video streaming player will be able to start playing in the middle of a large video.

# License

Copyright 2022-2024 SciActive Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
