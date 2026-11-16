import { pipeline, Readable } from 'node:stream';
import { basename } from 'node:path';
import type { Properties, Resource, User } from 'nephele';
import { InternalServerError } from 'nephele';
import mime from 'mime';
import { BackPressureTransform } from '@sciactive/back-pressure-transform';

import type Plugin from './Plugin.js';
import { EncryptionProxyAdapter } from './EncryptionProxyAdapter.js';
import { EncryptionProxyProperties } from './EncryptionProxyProperties.js';

export class EncryptionProxyResource implements Resource {
  plugin: Plugin;
  adapter: EncryptionProxyAdapter;
  targetResource: Resource;
  baseUrl: URL;
  keys: { content: Buffer; name: Buffer; nameIV: Buffer };

  constructor(
    plugin: Plugin,
    adapter: EncryptionProxyAdapter,
    targetResource: Resource,
    baseUrl: URL,
    keys: { content: Buffer; name: Buffer; nameIV: Buffer },
  ) {
    this.plugin = plugin;
    this.adapter = adapter;
    this.targetResource = targetResource;
    this.baseUrl = baseUrl;
    this.keys = keys;
  }

  async shouldEncrypt() {
    if (!this.adapter.encryption) {
      return false;
    }

    const properties = await this.targetResource.getProperties();

    try {
      const iv = await properties.get('nephele-encryption-iv');

      if (typeof iv !== 'string') {
        // This will happen if an upload is interrupted with an error. Rather than
        // cause the server to throw errors for the entire directory, just
        // consider it a non-encrypted resource.
        return false;
      }
    } catch (e: any) {
      // Same here.
      return false;
    }

    const path = await this.targetResource.getCanonicalPath();
    return this.adapter.shouldEncryptPath(path);
  }

  async getLocks() {
    return await this.targetResource.getLocks();
  }

  async getLocksByUser(user: User) {
    return await this.targetResource.getLocksByUser(user);
  }

  async createLockForUser(user: User) {
    return await this.targetResource.createLockForUser(user);
  }

  async getProperties(): Promise<Properties> {
    const properties = await this.targetResource.getProperties();
    return new EncryptionProxyProperties(this.plugin, this, properties);
  }

  async getStream(range?: { start: number; end: number }) {
    if (!(await this.shouldEncrypt())) {
      return await this.targetResource.getStream(range);
    }

    const newRange = range ? { ...range } : undefined;

    // The encryption block size.
    const BLOCK_SIZE = 16;
    // How many bytes to read in first to start decrypting correctly.
    const BYTE_PREFIX = BLOCK_SIZE * 2;
    // How many bytes from the first byte read before sending to the stream.
    let offset = 0;
    // How many bytes to send to the stream.
    let byteLength = Infinity;
    // This needs to be true if the eof is not included in the range.
    let nonEOF = false;
    if (newRange) {
      byteLength = newRange.end - newRange.start + 1; // +1 because range is inclusive.

      // Make sure we read a whole number of blocks.
      if (isFinite(newRange.end) && newRange.end % BLOCK_SIZE) {
        newRange.end =
          newRange.end + (BLOCK_SIZE - (newRange.end % BLOCK_SIZE));
      }

      if (isFinite(newRange.end)) {
        const length = await this.targetResource.getLength();

        // Read one block-1 past the end to account for inclusive range.
        newRange.end += BLOCK_SIZE - 1;
        if (newRange.end > length - 1) {
          newRange.end = length - 1;
        } else if (newRange.end < length - 1) {
          nonEOF = true;
        }
      }

      // Make sure we start at the beginning of a block, and start before the
      // request to allow data to start decrypting correctly.
      if (newRange.start < BYTE_PREFIX) {
        offset = newRange.start;
        newRange.start = 0;
      } else {
        offset = (newRange.start % BLOCK_SIZE) + BYTE_PREFIX;
        newRange.start = newRange.start - offset;
      }
    }

    const properties = await this.targetResource.getProperties();
    const iv = await properties.get('nephele-encryption-iv');

    if (typeof iv !== 'string') {
      throw new InternalServerError(
        'Initialization vector not found. Cannot decrypt resource.',
      );
    }

    // TODO: handle a range request that ends at the end of the file.
    // (need to request the padding at the end)
    const stream = await this.targetResource.getStream(newRange);
    const cipher = await this.plugin.getDecryptedStream(
      this.keys.content,
      iv,
      stream,
      BLOCK_SIZE,
      nonEOF,
    );

    if (newRange) {
      // How many bytes we've discarded from the front of the encryption stream.
      let discarded = 0;
      // How many bytes we've sent to the output stream.
      let transmitted = 0;

      const output = new BackPressureTransform(async (chunk: Buffer) => {
        if (transmitted >= byteLength) {
          return;
        }

        let newChunk = chunk;
        if (discarded < offset) {
          if (discarded + chunk.length <= offset) {
            // Discard entire chunk.
            discarded += chunk.length;
            return;
          } else {
            // Discard part of the chunk.
            newChunk = chunk.subarray(offset - discarded);
            discarded = offset;
          }
        }

        if (newChunk.length) {
          if (transmitted + newChunk.length > byteLength) {
            // Truncate the chunk
            newChunk = newChunk.subarray(0, byteLength - transmitted);
          }

          transmitted += newChunk.length;

          return newChunk;
        }
      });

      pipeline(cipher, output.writable, (e: any) => {
        if (e) {
          output.readable.destroy(e);
        }
      });
      return output.readable;
    }

    return cipher;
  }

  async setStream(input: Readable, user: User, mediaType?: string) {
    if (!(await this.shouldEncrypt())) {
      return await this.targetResource.setStream(input, user, mediaType);
    }

    const properties = await this.targetResource.getProperties();
    const { stream } = await this.plugin.getEncryptedStream(
      this.keys.content,
      input,
      async (iv: string) => {
        await properties.set('nephele-encryption-iv', iv);
      },
      async (paddingBytes: number) => {
        await properties.set(
          'nephele-encryption-padding-bytes',
          `${paddingBytes}`,
        );
      },
    );

    await this.targetResource.setStream(stream, user);
  }

  async create(user: User) {
    return await this.targetResource.create(user);
  }

  async delete(user: User) {
    return await this.targetResource.delete(user);
  }

  async copy(destination: URL, baseUrl: URL, user: User) {
    return await this.targetResource.copy(
      await this.adapter.encryptUrl(destination),
      baseUrl,
      user,
    );
  }

  async move(destination: URL, baseUrl: URL, user: User) {
    const destinationUrl = await this.adapter.encryptUrl(destination);
    return await this.targetResource.move(destinationUrl, baseUrl, user);
  }

  async getLength() {
    const length = await this.targetResource.getLength();

    if (!(await this.shouldEncrypt()) || (await this.isCollection())) {
      return length;
    }

    const properties = await this.targetResource.getProperties();
    let paddingBytes = 0;
    try {
      paddingBytes = parseInt(
        `${await properties.get('nephele-encryption-padding-bytes')}`,
      );
    } catch (e: any) {
      // Ignore error here.
    }

    return length - paddingBytes;
  }

  async getEtag() {
    return await this.targetResource.getEtag();
  }

  async getMediaType() {
    if (await this.isCollection()) {
      return null;
    }

    const path = await this.getCanonicalPath();

    const mediaType = mime.getType(basename(path));
    if (!mediaType) {
      return 'application/octet-stream';
    } else if (Array.isArray(mediaType)) {
      return typeof mediaType[0] === 'string'
        ? mediaType[0]
        : 'application/octet-stream';
    } else if (typeof mediaType === 'string') {
      return mediaType;
    } else {
      return 'application/octet-stream';
    }
  }

  async getCanonicalName() {
    const filename = await this.targetResource.getCanonicalName();
    const path = await this.targetResource.getCanonicalPath();
    return filename.startsWith('_E_') && this.adapter.shouldEncryptPath(path)
      ? await this.plugin.getDecryptedFilename(
          this.keys.name,
          this.keys.nameIV,
          filename,
        )
      : filename;
  }

  async getCanonicalPath() {
    const path = await this.targetResource.getCanonicalPath();
    return await this.adapter.decryptPath(path);
  }

  async getCanonicalUrl() {
    const url = await this.targetResource.getCanonicalUrl();
    return await this.adapter.decryptUrl(url);
  }

  async isCollection() {
    return await this.targetResource.isCollection();
  }

  async getInternalMembers(user: User) {
    const resources = await this.targetResource.getInternalMembers(user);
    return resources.map(
      (resource) =>
        new EncryptionProxyResource(
          this.plugin,
          this.adapter,
          resource,
          this.baseUrl,
          this.keys,
        ),
    );
  }
}
