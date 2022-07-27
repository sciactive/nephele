import { Readable } from 'node:stream';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mmm, { Magic } from 'mmmagic';

import type { Resource as ResourceInterface } from '../index.js';
import {
  MethodNotSupportedError,
  ResourceExistsError,
  ResourceTreeNotCompleteError,
} from '../index.js';

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
    return path.join(this.adapter.root, this.path);
  }

  async getLocks() {
    return [];
  }

  async getLocksByUser(user: User) {
    return [];
  }

  async getProperties() {
    return new Properties({ resource: this });
  }

  async getStream() {
    if (await this.isCollection()) {
      const stream = Readable.from([]);
      return stream;
    }

    const handle = await fsp.open(this.absolutePath, 'r');

    const stream = handle.createReadStream();
    stream.on('end', () => {
      handle.close();
    });

    return stream;
  }

  async setStream(input: Readable, user: User) {
    let exists = true;

    try {
      await fsp.access(path.dirname(this.absolutePath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError();
    }

    try {
      await fsp.access(this.absolutePath, constants.W_OK);
    } catch (e: any) {
      exists = false;
    }

    const handle = await fsp.open(this.absolutePath, 'w');

    const stream = handle.createWriteStream();

    input.pipe(stream);

    return new Promise<void>((resolve, reject) => {
      stream.on('close', async () => {
        if (!exists && this.adapter.pam) {
          await fsp.chown(
            this.absolutePath,
            await user.getUid(),
            await user.getGid()
          );
        }

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

  async create(user: User) {
    if (await this.exists()) {
      throw new ResourceExistsError('A resource already exists here.');
    }

    try {
      await fsp.access(path.dirname(this.absolutePath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    if (this.createCollection) {
      await fsp.mkdir(this.absolutePath);
    } else {
      await fsp.writeFile(this.absolutePath, Uint8Array.from([]));
    }

    if (this.adapter.pam) {
      await fsp.chown(
        this.absolutePath,
        await user.getUid(),
        await user.getGid()
      );
    }
  }

  async getLength() {
    if (await this.isCollection()) {
      return 0;
    }

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

  async getCanonicalPath() {
    if (await this.isCollection()) {
      return this.path.replace(/(?:$|\/$)/, () => '/');
    }
    return this.path;
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

    url += encodeURI((await this.getCanonicalPath()).replace(/^\//, ''));

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

  async getInternalMembers() {
    if (!(await this.isCollection())) {
      throw new MethodNotSupportedError('This is not a collection.');
    }

    const listing = await fsp.readdir(this.absolutePath);
    const resources: Resource[] = [];

    for (let name of listing) {
      if (name.endsWith('.nepheleprops')) {
        continue;
      }

      resources.push(
        new Resource({
          path: path.join(this.path, name),
          adapter: this.adapter,
        })
      );
    }

    return resources;
  }

  async exists() {
    try {
      await fsp.access(this.absolutePath, constants.F_OK);
    } catch (e: any) {
      return false;
    }

    return true;
  }

  async getStats() {
    return await fsp.stat(this.absolutePath);
  }

  async getPropFilePath() {
    if (await this.isCollection()) {
      return path.join(this.absolutePath, '.nepheleprops');
    } else {
      const dirname = path.dirname(this.absolutePath);
      const basename = path.basename(this.absolutePath);
      return path.join(dirname, `.${basename}.nepheleprops`);
    }
  }
}
