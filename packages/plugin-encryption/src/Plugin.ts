import {
  scrypt,
  randomFill,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Request } from 'express';
import type { Plugin as PluginInterface, AuthResponse, Adapter } from 'nephele';
import { UnauthorizedError, InternalServerError } from 'nephele';
import basicAuth from 'basic-auth';
import base85 from 'base85';
import { BackPressureTransform } from '@sciactive/back-pressure-transform';

import { EncryptionProxyAdapter } from './EncryptionProxyAdapter.js';

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeRegex(find: string) {
  return new RegExp(escapeRegExp(find), 'g');
}

const Z85_CONVERSIONS: [string, string, RegExp, RegExp][] = [
  ['/', '_'],
  ['<', '`'],
  ['>', '~'],
  [':', ';'],
  ['?', "'"],
  ['*', '\xBF'],
  ['.', '\xA1'],
].map(([from, to]) => [from, to, makeRegex(from), makeRegex(to)]);

export type PluginConfig = {
  /**
   * The salt used to generate encryption keys.
   *
   * It should be a long random string. You can generate one with `npx uuid`.
   */
  salt: string;
  /**
   * The salt used to generate filename encryption keys.
   *
   * It should be different than the other salts.
   */
  filenameSalt: string;
  /**
   * The salt used to generate filename initialization vectors.
   *
   * It should be different than the other salts.
   */
  filenameIVSalt: string;
  /**
   * The encoding to use for filenames ('base64' or 'ascii85').
   *
   * Filenames are encrypted into a cyphertext, which is raw binary data. File
   * systems don't expect raw binary as file names though, so it needs to be
   * encoded. This plugin offers two encodings, each suitable to different
   * scenarios.
   *
   * Base64, actually Base64URL, is suitable for all file systems and web-based
   * storage backends (like Amazon S3, Azure Blob Store, etc). It incurs an
   * overhead of roughly 35%.
   *
   * Ascii85, actually a modified version of Z85, is suitable for almost all
   * file systems (ext4, NTFS, exFAT, Btrfs, etc). Unlike what the name implies,
   * it does use Ascii characters above 127, so it is not suitable for file
   * systems which expect only valid UTF-8 names. It is also not suitable for
   * web-based storage backends. It incurs an overhead of roughly 25%, so you
   * can use this if your adapter supports it to allow files with longer
   * filenames to be uploaded.
   */
  filenameEncoding?: 'base64' | 'ascii85';
  /**
   * A password to use globally instead of user passwords.
   *
   * The reason you'd want to use this is if you trust the environment your
   * Nephele server is running in, but you don't trust the environment your data
   * backend is running in. For example, if you are running Nephele in a server
   * in your home, but you are using Amazon S3 as your storage backend.
   *
   * If you use this option, it is no longer required that a user be logged in.
   * Additionally, if a user changes their password, they can still access their
   * files.
   *
   * You can set this to a long, random string, just like `salt`. You can
   * generate one with `npx uuid`.
   */
  globalPassword?: string;
  /**
   * A list of glob patterns to exclude from the encryption/decryption process.
   */
  exclude?: string[];
};

/**
 * Nephele encryption plugin.
 *
 * This plugin encrypts filenames and file contents.
 */
export default class Plugin implements PluginInterface {
  baseUrl?: URL;
  salt: string;
  filenameSalt: string;
  filenameIVSalt: string;
  filenameEncoding: 'base64' | 'ascii85' = 'base64';
  globalPassword?: string;
  exclude: string[] = [];
  algorithm = 'aes-256-cbc';

  constructor({
    salt,
    filenameSalt,
    filenameIVSalt,
    filenameEncoding,
    globalPassword,
    exclude,
  }: PluginConfig) {
    this.salt = salt;
    this.filenameSalt = filenameSalt;
    this.filenameIVSalt = filenameIVSalt;
    if (filenameEncoding != null) {
      this.filenameEncoding = filenameEncoding;
    }
    if (globalPassword != null) {
      this.globalPassword = globalPassword;
    }
    if (exclude != null) {
      this.exclude = exclude;
    }
  }

  async prepareAdapter(
    request: Request,
    _response: AuthResponse,
    adapter: Adapter,
  ) {
    if (!this.baseUrl) {
      return;
    }
    const baseUrl = this.baseUrl;

    let password: string;

    if (this.globalPassword == null) {
      const authorization = request.get('Authorization');

      if (!authorization) {
        return;
      }

      const auth = basicAuth.parse(authorization);
      if (!auth || auth.pass.trim() === '') {
        throw new UnauthorizedError(
          'Authentication is required to use this server.',
        );
      }

      password = auth.pass.trim();
    } else {
      password = this.globalPassword;
    }

    // Generate a cryptographic hash of the password for the filename key
    // generation. The filename key is much more likely to be broken than the
    // content key, because of the reuse of the IV over and over. Therefore,
    // it would be better to hash it even more.
    const namePasswordHash = createHash('sha-224').update(password).digest();
    // Do the same to that hash for the IV generation.
    const nameIVHash = createHash('sha-224').update(namePasswordHash).digest();

    const keys = {
      // This key is used for file contents.
      content: await new Promise<Buffer>((resolve, reject) => {
        scrypt(password, Buffer.from(this.salt), 32, (err, key) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(key);
        });
      }),

      // This key is used for filenames.
      name: await new Promise<Buffer>((resolve, reject) => {
        scrypt(
          namePasswordHash,
          Buffer.from(this.filenameSalt),
          32,
          (err, key) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(key);
          },
        );
      }),

      // This initialization vector is used for filenames.
      nameIV: await new Promise<Buffer>((resolve, reject) => {
        scrypt(nameIVHash, Buffer.from(this.filenameIVSalt), 16, (err, key) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(key);
        });
      }),
    };

    return new EncryptionProxyAdapter(this, adapter, keys, baseUrl);
  }

  async beforeAuth(_request: Request, response: AuthResponse) {
    if (response.locals.adapter instanceof EncryptionProxyAdapter) {
      response.locals.adapter.encryption = false;
    }
  }

  async begin(request: Request, response: AuthResponse) {
    if (
      request.method === 'OPTIONS' &&
      request.path === response.locals.baseUrl.pathname
    ) {
      return;
    }

    if (!this.baseUrl) {
      throw new InternalServerError(
        'Encryption plugin was not provided baseUrl.',
      );
    }

    if (response.locals.adapter instanceof EncryptionProxyAdapter) {
      if (this.globalPassword != null) {
        response.locals.adapter.encryption = true;
      } else {
        const authorization = request.get('Authorization');

        if (authorization) {
          response.locals.adapter.encryption = true;
        }
      }
    }
  }

  escapeFilename(filename: Buffer) {
    if (this.filenameEncoding === 'ascii85') {
      let result = base85.encode(filename);
      for (let [_from, to, from] of Z85_CONVERSIONS) {
        result = result.replace(from, to);
      }
      return result;
    } else {
      return filename.toString('base64url');
    }
  }

  unescapeFilename(filename: string) {
    if (this.filenameEncoding === 'ascii85') {
      let result = filename;
      for (let [from, _to, _from, to] of Z85_CONVERSIONS) {
        result = result.replace(to, from);
      }
      return base85.decode(result) as Buffer;
    } else {
      return Buffer.from(filename, 'base64url');
    }
  }

  async getEncryptedFilename(
    key: Buffer,
    iv: Buffer,
    filename: string,
  ): Promise<string> {
    const cipher = createCipheriv(this.algorithm, key, iv);

    let output = Buffer.from([]);
    const promise = new Promise((resolve, reject) => {
      cipher.on('error', reject);

      cipher.on('data', (chunk) => (output = Buffer.concat([output, chunk])));

      cipher.on('end', resolve);
    });

    cipher.write(filename, 'utf8');
    cipher.end();

    await promise;

    return '_E_' + this.escapeFilename(output);
  }

  async getDecryptedFilename(
    key: Buffer,
    iv: Buffer,
    filename: string,
  ): Promise<string> {
    const decipher = createDecipheriv(this.algorithm, key, iv);

    let output = Buffer.from([]);
    const promise = new Promise((resolve, reject) => {
      decipher.on('error', reject);

      decipher.on('data', (chunk) => (output = Buffer.concat([output, chunk])));

      decipher.on('end', resolve);
    });

    decipher.write(this.unescapeFilename(filename.replace(/^_E_/, '')));
    decipher.end();

    await promise;

    return output.toString('utf8');
  }

  async getEncryptedStream(
    key: Buffer,
    stream: Readable,
    ivCallback: (iv: string) => Promise<void>,
    doneCallback: (paddingBytes: number) => void,
  ) {
    const iv = await new Promise<Uint8Array>((resolve, reject) => {
      randomFill(new Uint8Array(16), (err, iv) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(iv);
      });
    });

    await ivCallback(Buffer.from(iv.buffer).toString('base64'));

    let streamLength = 0;
    let cipherLength = 0;

    // Use counter streams to calculate how much padding was added.
    const streamWithCounter = new BackPressureTransform(async (chunk) => {
      streamLength += chunk?.length ?? 0;
      return chunk;
    });
    stream.pipe(streamWithCounter.writable);
    stream.on('error', (err) => {
      if (!streamWithCounter.writable.destroyed) {
        streamWithCounter.writable.destroy(err);
      }
    });
    streamWithCounter.writable.on('error', (err) => {
      if (!stream.destroyed) {
        stream.destroy(err);
      }
    });

    const cipher = createCipheriv(this.algorithm, key, iv);

    streamWithCounter.readable.pipe(cipher);
    streamWithCounter.readable.on('error', (err) => {
      if (!cipher.destroyed) {
        cipher.destroy(err);
      }
    });
    cipher.on('error', (err) => {
      if (!streamWithCounter.readable.destroyed) {
        streamWithCounter.readable.destroy(err);
      }
    });

    const cipherWithCounter = new BackPressureTransform(async (chunk) => {
      cipherLength += chunk?.length ?? 0;
      return chunk;
    });
    cipher.pipe(cipherWithCounter.writable);
    cipher.on('error', (err) => {
      if (!cipherWithCounter.writable.destroyed) {
        cipherWithCounter.writable.destroy(err);
      }
    });
    cipherWithCounter.writable.on('error', (err) => {
      if (!cipher.destroyed) {
        cipher.destroy(err);
      }
    });

    cipherWithCounter.readable.on('close', () => {
      // Report the amount of padding.
      doneCallback(cipherLength - streamLength);
    });

    return {
      stream: cipherWithCounter.readable,
      iv: Buffer.from(iv.buffer).toString('base64'),
    };
  }

  async getDecryptedStream(key: Buffer, iv: string, stream: Readable) {
    const decipher = createDecipheriv(
      this.algorithm,
      key,
      new Uint8Array(Buffer.from(iv, 'base64')),
    );

    stream.pipe(decipher);
    stream.on('error', (err) => {
      if (!decipher.destroyed) {
        decipher.destroy(err);
      }
    });

    // Need the passthrough to hide the error.
    const passthrough = new BackPressureTransform();
    decipher.pipe(passthrough.writable);
    decipher.on('error', (err) => {
      // Ignore error about wrong final block length.
      if (
        (err as Error & { code?: string })?.code ===
        'ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH'
      ) {
        passthrough.writable.end();
        return;
      }
      if (!stream.destroyed) {
        stream.destroy(err);
      }
      if (!passthrough.writable.destroyed) {
        passthrough.writable.destroy(err);
      }
    });
    passthrough.writable.on('error', (err) => {
      if (!decipher.destroyed) {
        decipher.destroy(err);
      }
    });

    return passthrough.readable;
  }
}
