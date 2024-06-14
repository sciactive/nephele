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
        // Don't use this one, generate your own.
        salt: '5de338e9a6c8465591821c4f5e1c5acf',
        // Don't use this one, generate your own.
        filenameSalt: '3ac159a27a3342c0bb106affac46812f',
        // Don't use this one, generate your own.
        filenameIVSalt: '7f3bf86e561d46bcbba06702eb0d7718',

        exclude: ['**/.htpasswd'],
      }),
    ],
  }),
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

Warning: When no `globalPassword` is set, this plugin uses the user's password from Basic authentication to create an encryption key. This means that if the user's password changes, their files will not be decryptable. It also means this plugin does not work with digest authentication.

# Options / Defaults

- `salt` = `undefined`: The salt used to generate file content encryption keys.
- `filenameSalt` = `undefined`: The salt used to generate filename encryption keys.
- `filenameIVSalt` = `undefined`: The salt used to generate filename initialization vectors.
- `filenameEncoding` = `'base64'`: The encoding to use for filenames ('base64' or 'ascii85').
- `globalPassword` = `undefined`: A password to use globally instead of user passwords.
- `exclude` = `[]`: A list of glob patterns to exclude from the encryption/decryption process.

## salt

It should be a long random string. You can generate one with `npx uuid`.

## filenameSalt

It should be different than the other salts.

## filenameIVSalt

It should be different than the other salts.

## filenameEncoding

Filenames are encrypted into a cyphertext, which is raw binary data. File systems don't expect raw binary as file names though, so it needs to be encoded. This plugin offers two encodings, each suitable to different scenarios.

Base64, actually Base64URL, is suitable for all file systems and web-based storage backends (like Amazon S3, Azure Blob Store, Digital Ocean Spaces, etc). It incurs an overhead of roughly 35%.

Ascii85, actually a modified version of Z85, is suitable for almost all file systems (ext4, NTFS, exFAT, Btrfs, etc). Unlike what the name implies, it does use Ascii characters above 127, so it is not suitable for file systems which expect only valid UTF-8 names. It is also not suitable for web-based storage backends. It incurs an overhead of roughly 25%, so you can use this if your adapter supports it to allow files with longer filenames to be uploaded.

## globalPassword

The reason you'd want to use this is if you trust the environment your Nephele server is running in, but you don't trust the environment your data backend is running in. For example, if you are running Nephele in a server in your home, but you are using Amazon S3 as your storage backend.

If you use this option, it is no longer required that a user be logged in. Additionally, if a user changes their password, they can still access their files.

You can set this to a long, random string, just like `salt`. You can generate one with `npx uuid`.

# Purpose

## What is this plugin for?

This plugin provides [encryption at rest](https://phoenixnap.com/blog/encryption-at-rest). It is useful to protect your data from prying eyes who have access to your underlying data store. Take, for example, a Nephele server using Amazon S3 as its storage backend. Every Amazon employee who has administrator access to their S3 servers can access customer data stored on them. This plugin would prevent these employees from being able to read the filenames and file contents stored on their servers through the Nephele server.

Encryption at rest is also useful if your server becomes physically compromised. A malicious actor who steals your server's physical hardware would not be able to decrypt the data stored on it without the user passwords. (This does not apply if you are using `globalPassword`.)

## What is this plugin not for?

This plugin does not provide [encryption in transit](https://phoenixnap.com/blog/data-in-transit-encryption). Nephele natively supports [HTTPS](https://en.wikipedia.org/wiki/HTTPS), and you should use that feature for encryption in transit.

This plugin does not provide [end-to-end encryption](https://en.wikipedia.org/wiki/End-to-end_encryption). That is to say, the server handles encrypting your data for you. When you send a request to the server, you include your password, which is necessary for encrypting and decrypting your data. Your data is then encrypted using your password before being stored in the storage backend. As such, if a malicious actor has administrator access to your server while you're using it, they can sniff the traffic coming into it, steal your password, and decrypt your data.

This plugin does not provide [deniable encryption](https://en.wikipedia.org/wiki/Deniable_encryption). Anyone with access to your files can see that they are encrypted, as well as their exact content lengths and the approximate lengths of their filenames. This data _could_ be used to infer certain information about your files, but the likelihood that that would generate usable information is quite small.

If you have not set `globalPassword`, this plugin will require a user password through [HTTP Basic authentication](https://en.wikipedia.org/wiki/Basic_access_authentication). As such, it cannot be used for any anonymously accessible namespaces without a global password (or else there will be no encryption/decryption).

# Encryption

## File Contents

[AES-256](https://en.wikipedia.org/wiki/Advanced_Encryption_Standard) is used in [Cipher Block Chaining](<https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation#Cipher_block_chaining_(CBC)>) mode. A random 16 byte initialization vector is generated for every file. This initialization vector, along with the length of any added padding, is stored in the properties of encrypted resources. The random initialization vector ensures that two files with exactly the same contents will still produce completely different ciphertext when encrypted.

AES-256 is a well tested encryption standard that is used extensively in the industry. Many CPUs have dedicated hardware to handle AES encryption and decryption. Cipher Block Chaining mode allows AES-256 to act like a stream cipher, and also allows Nephele to answer Range requests (non-sequential read access) even for encrypted files. This means, for example, your video streaming player will be able to start playing in the middle of a large video.

If you copy a file through WebDAV, because of the way Nephele works, both files will have the same ciphertext, and thus a malicious actor could determine that they are the same file. If this is not acceptable, instead you should download the file, then reupload it in the new location.

## Filenames

AES-256 in Cipher Block Chaining mode is also used, but with a different key than file contents and a constant initialization vector. Files and directories need to have a one to one mapping of ciphertext to plaintext to facilitate fast access. Otherwise, requesting a file might require scanning the entire directory tree to find it.

This does have the drawback that two files with the same plaintext filename will have the same ciphertext filename after encryption. This also applies to prefixes greater than 16 bytes. For example, two files named "The Dark Knight (2008) - IMAX.mp4" and "The Dark Knight (2008) - IMAX.srt" will have mostly the same ciphertext filename, only differing in the last few characters. This can reveal certain information about files and directory structures. (More information about the security implications can be found [here](https://stackered.com/blog/iv-mishandling/).)

Since AES-256 is a block cipher, this does have the benefit that a malicious actor would not be able to tell exactly how long the plaintext filename is only knowing the ciphertext filename. If a ciphertext filename is `n` bytes long, the plaintext filename could be any length between `n - 15` and `n` bytes.

One last note is that filename ciphertext is encoded with a [binary-to-text encoder](https://en.wikipedia.org/wiki/Binary-to-text_encoding) and prepended with the text `_E_` (so that this plugin can tell what names have been encrypted) before being passed to the storage backend. This causes a filename length overhead of roughly 25% for `ascii85` or roughly 35% for `base64`. There can be additional overhead of up to 15 pre-encoded bytes from any needed encryption padding. Therefore, if your storage backend has a [maximum filename length](https://en.wikipedia.org/wiki/Comparison_of_file_systems#Limits), it will be reduced by this overhead amount when going through Nephele with this plugin.

### Filename Characters

The filenames this plugin generates include the following characters for Base64:

```
0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_
```

And the following characters for Ascii85:

```
0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ¡-;+=^!_¿'&`~()[]{}@%$#
```

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
