import { Readable } from 'node:stream';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mmm, { Magic } from 'mmmagic';

import type { Resource as ResourceInterface } from '../index.js';
import {
  BadGatewayError,
  ForbiddenError,
  MethodNotSupportedError,
  ResourceExistsError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
  UnauthorizedError,
} from '../index.js';

import type Adapter from './Adapter.js';
import {
  userExecuteBit,
  userWriteBit,
  groupExecuteBit,
  groupWriteBit,
  otherExecuteBit,
  otherWriteBit,
} from './FileSystemBits.js';
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

  get absolutePath() {
    return path.join(this.adapter.root, this.path);
  }

  async getLocks() {
    return [];
  }

  async getLocksByUser(_user: User) {
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
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    if (await this.isCollection()) {
      throw new MethodNotSupportedError(
        'This resource is an existing collection.'
      );
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

  async delete(user: User) {
    if (!(await this.exists())) {
      throw new ResourceNotFoundError("This resource couldn't be found.");
    }

    try {
      await fsp.access(this.absolutePath, constants.W_OK);
    } catch (e: any) {
      throw new ForbiddenError('This resource cannot be deleted.');
    }

    const propsFilePath = await this.getPropFilePath();
    let propsFileExists = false;
    try {
      await fsp.access(propsFilePath, constants.F_OK);
      propsFileExists = true;
    } catch (e: any) {
      propsFileExists = false;
    }

    if (propsFileExists) {
      try {
        await fsp.access(propsFilePath, constants.W_OK);
      } catch (e: any) {
        throw new ForbiddenError('This resource cannot be deleted.');
      }
    }

    // We need the user and group IDs.
    const uid = await (user as User).getUid();
    const gids = await (user as User).getGids();

    if (this.adapter.pam) {
      // Check if the user can delete it.
      const stats = await fsp.stat(this.absolutePath);

      if (
        !(
          stats.mode & otherWriteBit ||
          (stats.uid === uid && stats.mode & userWriteBit) ||
          (gids.includes(stats.gid) && stats.mode & groupWriteBit)
        )
      ) {
        throw new UnauthorizedError(
          'You do not have permission to delete this resource.'
        );
      }
    }

    if (propsFileExists) {
      await fsp.unlink(propsFilePath);
    }

    if (await this.isCollection()) {
      await this.deleteOrphanedConfigFiles();
      await fsp.rmdir(this.absolutePath);
    } else {
      await fsp.unlink(this.absolutePath);
    }
  }

  async copy(destination: URL, baseUrl: string, user: User) {
    const destinationPath = this.adapter.urlToAbsolutePath(
      destination,
      baseUrl
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.'
      );
    }

    if (this.absolutePath === destinationPath) {
      throw new ForbiddenError(
        'The source and destination are the same resource.'
      );
    }

    try {
      await fsp.access(path.dirname(destinationPath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    let propsFilePath: string | undefined = undefined;
    if (await this.isCollection()) {
      try {
        const stat = await fsp.stat(destinationPath);
        if (stat.isDirectory()) {
          try {
            await fsp.rm(path.join(destinationPath, '.nepheleprops'));
          } catch (e: any) {
            // Ignore errors deleting possible non-existent file.
          }
          await fsp.rmdir(destinationPath);
        } else {
          await fsp.unlink(destinationPath);
        }
      } catch (e: any) {
        // Ignore errors stat-ing a possible non-existent directory and deleting
        // a possibly non-empty directory.
      }
      try {
        await fsp.mkdir(destinationPath);
      } catch (e: any) {
        // We don't care if the function failed just because it's a directory
        // that already exists.
        const stat = await fsp.stat(destinationPath);
        if (!stat.isDirectory()) {
          throw e;
        }
      }
      try {
        propsFilePath = path.join(destinationPath, '.nepheleprops');
        try {
          await fsp.unlink(propsFilePath);
        } catch (e: any) {
          // Ignore errors deleting a possibly non-existend file.
        }
        await fsp.copyFile(await this.getPropFilePath(), propsFilePath);
      } catch (e: any) {
        // Ignore errors while copying props files.
        propsFilePath = undefined;
      }
    } else {
      await fsp.copyFile(this.absolutePath, destinationPath);
      try {
        const dirname = path.dirname(destinationPath);
        const basename = path.basename(destinationPath);
        propsFilePath = path.join(dirname, `${basename}.nepheleprops`);
        try {
          await fsp.unlink(propsFilePath);
        } catch (e: any) {
          // Ignore errors deleting a possibly non-existend file.
        }
        await fsp.copyFile(await this.getPropFilePath(), propsFilePath);
      } catch (e: any) {
        // Ignore errors while copying props files.
        propsFilePath = undefined;
      }
    }

    if (this.adapter.pam) {
      await fsp.chown(
        destinationPath,
        await user.getUid(),
        await user.getGid()
      );

      if (propsFilePath != null) {
        await fsp.chown(
          propsFilePath,
          await user.getUid(),
          await user.getGid()
        );
      }
    }

    return;
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

  async getCanonicalName() {
    return path.basename(this.path);
  }

  async getCanonicalPath() {
    if (await this.isCollection()) {
      return this.path.replace(/(?:$|\/$)/, () => '/');
    }
    return this.path;
  }

  async getCanonicalUrl(baseUrl: URL) {
    let url = baseUrl.toString().replace(/(?:$|\/$)/, () => '/');

    url += encodeURI((await this.getCanonicalPath()).replace(/^\//, () => ''));

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

  async getInternalMembers(user: User) {
    if (!(await this.isCollection())) {
      throw new MethodNotSupportedError('This is not a collection.');
    }

    // We need the user and group IDs.
    const uid = await user.getUid();
    const gids = await user.getGids();

    if (this.adapter.pam) {
      // Check if the user can list its contents.
      const stats = await fsp.stat(this.absolutePath);

      if (
        !(
          stats.mode & otherExecuteBit ||
          (stats.uid === uid && stats.mode & userExecuteBit) ||
          (gids.includes(stats.gid) && stats.mode & groupExecuteBit)
        )
      ) {
        throw new UnauthorizedError(
          "You do not have permission to list this collection's members."
        );
      }
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
      return path.join(dirname, `${basename}.nepheleprops`);
    }
  }

  async deleteOrphanedConfigFiles() {
    if (!(await this.isCollection())) {
      throw new MethodNotSupportedError('This is not a collection.');
    }

    const listing = await fsp.readdir(this.absolutePath);
    const files: Set<string> = new Set();
    const propsFiles: Set<string> = new Set();

    for (let name of listing) {
      if (name === '.nepheleprops') {
        continue;
      }

      if (name.endsWith('.nepheleprops')) {
        propsFiles.add(name);
      } else {
        files.add(name);
      }
    }

    for (let name of files) {
      propsFiles.delete(`${name}.nepheleprops`);
    }

    const orphans = Array.from(propsFiles);

    for (let name of orphans) {
      const orphanPath = path.join(this.absolutePath, name);
      await fsp.unlink(orphanPath);
    }
  }
}
