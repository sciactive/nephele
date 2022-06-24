import type { Readable } from 'node:stream';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mmm, { Magic } from 'mmmagic';

import type { Resource as ResourceInterface } from '../Resource.js';

import type Adapter from './Adapter.js';
import Properties from './Properties.js';
import type User from './User.js';

export default class Resource implements ResourceInterface {
  path: string;
  adapter: Adapter;
  private createCollection: boolean | undefined = undefined;

  constructor({
    path,
    adapter,
    collection,
  }: {
    path: string;
    adapter: Adapter;
    collection?: true;
  }) {
    this.path = path;
    this.adapter = adapter;

    if (collection) {
      this.createCollection = true;
    }
  }

  private get absolutePath() {
    // This is absolutely wrong for production, because '..' is illegal in a
    // WebDAV path.
    return path.resolve(this.adapter.root, this.path);
  }

  async getLockByUser(user: User) {
    return null;
  }

  async getProperties() {
    return new Properties({ resource: this });
  }

  async getStream() {
    const handle = await fsp.open(this.absolutePath, 'r');

    return handle.createReadStream();
  }

  async setStream(input: Readable) {
    const handle = await fsp.open(this.absolutePath, 'w');

    const stream = handle.createWriteStream();

    input.pipe(stream);

    return new Promise<void>((resolve, reject) => {
      stream.on('close', () => {
        resolve();
      });

      stream.on('error', (err) => {
        reject(err);
      });

      input.on('error', (err) => {
        reject(err);
      });
    });
  }

  async getLength() {
    const stat = await fsp.stat(this.absolutePath);

    return stat.size;
  }

  async getEtag() {
    const stat = await fsp.stat(this.absolutePath);
    // This is also absolutely wrong for production, because an etag should be
    // unique based on file contents, not metadata.
    const etag = crypto
      .createHash('md5')
      .update(
        `size: ${stat.size}; ctime: ${stat.ctimeMs}; mtime: ${stat.mtimeMs}`
      )
      .digest('hex');

    return etag;
  }

  async getMediaType() {
    const mediaType = await new Promise<string>((resolve, reject) => {
      const magic = new Magic(mmm.MAGIC_MIME_TYPE);
      magic.detectFile(this.absolutePath, function (err, result) {
        if (err) {
          reject(err);
          return;
        }
        resolve(result as string); // didn't use MAGIC_CONTINUE, so only one string.
      });
    });

    return mediaType;
  }

  async getCanonicalUrl() {
    const scheme = this.adapter.scheme;
    const host = this.adapter.host;
    const port = this.adapter.port;
    const path = this.adapter.path;

    let url = `${scheme}://${host}`;

    if (
      !(
        (scheme === 'http' && port === 80) ||
        (scheme === 'https' && port === 443)
      )
    ) {
      url += `:${port}`;
    }

    url += encodeURI(path);

    url += encodeURI(this.path.replace(/^\//, ''));

    return new URL(url);
  }

  async isCollection() {
    if (this.createCollection) {
      return true;
    }

    try {
      const stats = await fsp.stat(this.absolutePath);
      return stats.isDirectory();
    } catch (e: any) {
      return false;
    }
  }

  async exists() {
    try {
      await fsp.access(this.absolutePath, constants.F_OK);
    } catch (e: any) {
      return false;
    }

    return true;
  }
}
