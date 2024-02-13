import {
  scrypt,
  randomFill,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Request } from 'express';
import type { Plugin as PluginInterface, AuthResponse } from 'nephele';
import { ForbiddenError, UnauthorizedError } from 'nephele';
import basicAuth from 'basic-auth';

import { EncryptionProxyAdapter } from './EncryptionProxyAdapter.js';
import { BackPressureTransform } from './BackPressureTransform.js';

export type PluginConfig = {
  /**
   * A list of glob patterns to exclude from the encryption/decryption process.
   */
  exclude?: string[];
  /**
   * The salt used with the passwords to generate encryption keys.
   *
   * It should be a long random string. You can generate one with `npx uuid`.
   */
  salt?: string;
};

/**
 * Nephele encryption plugin.
 *
 * This plugin encrypts filenames and file contents.
 */
export default class Plugin implements PluginInterface {
  exclude: string[] = [];
  salt: string = '5de338e9a6c8465591821c4f5e1c5acf';

  constructor({ exclude, salt }: PluginConfig = {}) {
    if (exclude != null) {
      this.exclude = exclude;
    }
    if (salt != null) {
      this.salt = salt;
    }
  }

  async begin(request: Request, response: AuthResponse) {
    if (
      request.method === 'OPTIONS' &&
      request.path === response.locals.baseUrl.pathname
    ) {
      return;
    }

    const authorization = request.get('Authorization');

    if (!authorization) {
      throw new ForbiddenError(
        "You don't have permission to access this resource."
      );
    }

    const auth = basicAuth.parse(authorization);
    if (!auth || auth.pass.trim() === '') {
      throw new UnauthorizedError(
        'Authentication is required to use this server.'
      );
    }

    const password = auth.pass.trim();

    const key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, Buffer.from(this.salt), 32, (err, key) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(key);
      });
    });

    const originalAdapter = response.locals.adapter;
    response.locals.adapter = new EncryptionProxyAdapter(
      this,
      originalAdapter,
      key
    );
  }

  // TODO: encrypt filenames

  async getEncryptedStream(
    stream: Readable,
    key: Buffer,
    callback: (paddingBytes: number) => void
  ) {
    const algorithm = 'aes-256-cbc';

    const iv = await new Promise<Uint8Array>((resolve, reject) => {
      randomFill(new Uint8Array(16), (err, iv) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(iv);
      });
    });

    let streamLength = 0;
    let cipherLength = 0;

    // Use counter streams to calculate how much padding was added.
    const streamWithCounter = new BackPressureTransform(async (chunk) => {
      streamLength += chunk.length;
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

    const cipher = createCipheriv(algorithm, key, iv);

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
      cipherLength += chunk.length;
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
      callback(cipherLength - streamLength);
    });

    return {
      stream: cipherWithCounter.readable,
      iv: Buffer.from(iv.buffer).toString('base64'),
    };
  }

  async getDecryptedStream(stream: Readable, key: Buffer, iv: string) {
    const algorithm = 'aes-256-cbc';

    const decipher = createDecipheriv(
      algorithm,
      key,
      new Uint8Array(Buffer.from(iv, 'base64'))
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
