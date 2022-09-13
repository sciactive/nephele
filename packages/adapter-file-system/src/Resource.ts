import { Readable } from 'node:stream';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import mime from 'mime';
import checkDiskSpace from 'check-disk-space';
import crc32 from 'cyclic-32';
import type { Resource as ResourceInterface, User } from 'nephele';
import {
  BadGatewayError,
  ForbiddenError,
  MethodNotSupportedError,
  ResourceExistsError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
  UnauthorizedError,
} from 'nephele';

import type Adapter from './Adapter.js';
import {
  userReadBit,
  userWriteBit,
  userExecuteBit,
  groupReadBit,
  groupWriteBit,
  groupExecuteBit,
  otherReadBit,
  otherWriteBit,
  otherExecuteBit,
} from './FileSystemBits.js';
import Properties from './Properties.js';
import Lock from './Lock.js';

export type MetaStorage = {
  props?: {
    [name: string]: any;
  };
  locks?: {
    [token: string]: {
      username: string;
      date: number;
      timeout: number;
      scope: 'exclusive' | 'shared';
      depth: '0' | 'infinity';
      provisional: boolean;
      owner: any;
    };
  };
};

export default class Resource implements ResourceInterface {
  adapter: Adapter;
  baseUrl: URL;
  path: string;
  private createCollection: boolean | undefined = undefined;
  private etag: string | undefined = undefined;

  constructor({
    adapter,
    baseUrl,
    path,
    collection,
  }: {
    adapter: Adapter;
    baseUrl: URL;
    path: string;
    collection?: true;
  }) {
    this.adapter = adapter;
    this.baseUrl = baseUrl;
    this.path = path;

    if (collection) {
      this.createCollection = true;
    }
  }

  get absolutePath() {
    return path.join(this.adapter.root, this.path);
  }

  async getLocks() {
    const meta = await this.readMetadataFile();

    if (meta.locks == null) {
      return [];
    }

    return Object.entries(meta.locks).map(([token, entry]) => {
      const lock = new Lock({ resource: this, username: entry.username });

      lock.token = token;
      lock.date = new Date(entry.date);
      lock.timeout = entry.timeout;
      lock.scope = entry.scope;
      lock.depth = entry.depth;
      lock.provisional = entry.provisional;
      lock.owner = entry.owner;

      return lock;
    });
  }

  async getLocksByUser(user: User) {
    const meta = await this.readMetadataFile();

    if (meta.locks == null) {
      return [];
    }

    return Object.entries(meta.locks)
      .filter(([_token, entry]) => user.username === entry.username)
      .map(([token, entry]) => {
        const lock = new Lock({ resource: this, username: user.username });

        lock.token = token;
        lock.date = new Date(entry.date);
        lock.timeout = entry.timeout;
        lock.scope = entry.scope;
        lock.depth = entry.depth;
        lock.provisional = entry.provisional;
        lock.owner = entry.owner;

        return lock;
      });
  }

  async createLockForUser(user: User) {
    return new Lock({ resource: this, username: user.username });
  }

  async getProperties() {
    return new Properties({ resource: this });
  }

  async getStream(range?: { start: number; end: number }) {
    if (await this.isCollection()) {
      return Readable.from([]);
    }

    const handle = await fsp.open(this.absolutePath, 'r');

    const stream = handle.createReadStream(range ? range : undefined);
    stream.on('close', () => {
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

    if (!exists && user.uid != null) {
      await fsp.writeFile(this.absolutePath, Buffer.from([]));
      await fsp.chown(
        this.absolutePath,
        await this.adapter.getUid(user),
        await this.adapter.getGid(user)
      );
    }

    this.etag = undefined;

    const handle = await fsp.open(this.absolutePath, 'w');
    const stream = handle.createWriteStream();

    input.pipe(stream);

    return new Promise<void>((resolve, reject) => {
      stream.on('close', async () => {
        resolve();
      });

      stream.on('error', (err) => {
        handle.close();
        reject(err);
      });

      input.on('error', (err) => {
        handle.close();
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

    if (user.uid != null) {
      await fsp.chown(
        this.absolutePath,
        await this.adapter.getUid(user),
        await this.adapter.getGid(user)
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

    const metaFilePath = await this.getMetadataFilePath();
    let metaFileExists = false;
    try {
      await fsp.access(metaFilePath, constants.F_OK);
      metaFileExists = true;
    } catch (e: any) {
      metaFileExists = false;
    }

    if (metaFileExists) {
      try {
        await fsp.access(metaFilePath, constants.W_OK);
      } catch (e: any) {
        throw new ForbiddenError('This resource cannot be deleted.');
      }
    }

    // We need the user and group IDs.
    const uid = await this.adapter.getUid(user);
    const gids = await this.adapter.getGids(user);

    if (user.uid != null) {
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

    if (metaFileExists) {
      await fsp.unlink(metaFilePath);
    }

    if (await this.isCollection()) {
      await this.deleteOrphanedMetadataFiles();
      await fsp.rmdir(this.absolutePath);
    } else {
      await fsp.unlink(this.absolutePath);
    }
  }

  async copy(destination: URL, baseUrl: URL, user: User) {
    const destinationPath = this.adapter.urlToAbsolutePath(
      destination,
      baseUrl
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.'
      );
    }

    if (
      this.absolutePath === destinationPath ||
      ((await this.isCollection()) &&
        destinationPath.startsWith(
          this.absolutePath.replace(/\/?$/, () => '/')
        ))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.'
      );
    }

    try {
      await fsp.access(path.dirname(destinationPath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    // We need the user and group IDs.
    const uid = await this.adapter.getUid(user);
    const gids = await this.adapter.getGids(user);

    if (user.uid != null) {
      // Check if the user can put it in the destination.
      const dstats = await fsp.stat(path.dirname(destinationPath));

      if (
        !(
          dstats.mode & otherReadBit ||
          (dstats.uid === uid && dstats.mode & userReadBit) ||
          (gids.includes(dstats.gid) && dstats.mode & groupReadBit)
        )
      ) {
        throw new UnauthorizedError(
          'You do not have permission to access the destination.'
        );
      }

      if (
        !(
          dstats.mode & otherWriteBit ||
          (dstats.uid === uid && dstats.mode & userWriteBit) ||
          (gids.includes(dstats.gid) && dstats.mode & groupWriteBit)
        )
      ) {
        throw new UnauthorizedError(
          'You do not have permission to write to the destination.'
        );
      }
    }

    let metaFilePath: string | undefined = undefined;
    if (await this.isCollection()) {
      try {
        const stat = await fsp.stat(destinationPath);
        if (stat.isDirectory()) {
          try {
            await fsp.rm(path.join(destinationPath, '.nephelemeta'));
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
        metaFilePath = path.join(destinationPath, '.nephelemeta');

        try {
          await fsp.unlink(metaFilePath);
        } catch (e: any) {
          // Ignore errors deleting a possibly non-existend file.
        }

        const meta = await this.readMetadataFile();
        meta.locks = {};
        await this.saveMetadataFile(meta, metaFilePath);
      } catch (e: any) {
        // Ignore errors while copying metadata files.
        metaFilePath = undefined;
      }
    } else {
      await fsp.copyFile(this.absolutePath, destinationPath);
      try {
        const dirname = path.dirname(destinationPath);
        const basename = path.basename(destinationPath);
        metaFilePath = path.join(dirname, `${basename}.nephelemeta`);

        try {
          await fsp.unlink(metaFilePath);
        } catch (e: any) {
          // Ignore errors deleting a possibly non-existend file.
        }

        const meta = await this.readMetadataFile();
        meta.locks = {};
        await this.saveMetadataFile(meta, metaFilePath);
      } catch (e: any) {
        // Ignore errors while copying metadata files.
        metaFilePath = undefined;
      }
    }

    if (user.uid != null) {
      const uid = await this.adapter.getUid(user);
      const gid = await this.adapter.getGid(user);

      // Set owner info.
      await fsp.chown(destinationPath, uid, gid);
      const stat = await fsp.stat(this.absolutePath);
      // Set permissions.
      await fsp.chmod(destinationPath, stat.mode % 0o1000);

      if (metaFilePath != null) {
        await fsp.chown(metaFilePath, uid, gid);
        await fsp.chmod(destinationPath, stat.mode % 0o1000);
      }
    }

    const stat = await fsp.stat(this.absolutePath);

    // Copy mode.
    try {
      await fsp.chmod(destinationPath, stat.mode);
    } catch (e: any) {
      // Ignore errors copying mode.
    }

    // Copy dates.
    try {
      await fsp.utimes(destinationPath, stat.atime, stat.mtime);
    } catch (e: any) {
      // Ignore errors copying dates.
    }

    return;
  }

  async move(destination: URL, baseUrl: URL, user: User) {
    if (await this.isCollection()) {
      throw new Error('Move called on a collection resource.');
    }

    const destinationPath = this.adapter.urlToAbsolutePath(
      destination,
      baseUrl
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.'
      );
    }

    if (
      this.absolutePath === destinationPath ||
      ((await this.isCollection()) &&
        destinationPath.startsWith(
          this.absolutePath.replace(/\/?$/, () => '/')
        ))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.'
      );
    }

    try {
      await fsp.access(path.dirname(destinationPath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    // We need the user and group IDs.
    const uid = await this.adapter.getUid(user);
    const gids = await this.adapter.getGids(user);

    if (user.uid != null) {
      // Check if the user can move it.
      const stats = await fsp.stat(this.absolutePath);

      if (
        !(
          stats.mode & otherWriteBit ||
          (stats.uid === uid && stats.mode & userWriteBit) ||
          (gids.includes(stats.gid) && stats.mode & groupWriteBit)
        )
      ) {
        throw new UnauthorizedError(
          'You do not have permission to move this resource.'
        );
      }

      // Check if the user can put it in the destination.
      const dstats = await fsp.stat(path.dirname(destinationPath));

      if (
        !(
          dstats.mode & otherReadBit ||
          (dstats.uid === uid && dstats.mode & userReadBit) ||
          (gids.includes(dstats.gid) && dstats.mode & groupReadBit)
        )
      ) {
        throw new UnauthorizedError(
          'You do not have permission to access the destination.'
        );
      }

      if (
        !(
          dstats.mode & otherWriteBit ||
          (dstats.uid === uid && dstats.mode & userWriteBit) ||
          (gids.includes(dstats.gid) && dstats.mode & groupWriteBit)
        )
      ) {
        throw new UnauthorizedError(
          'You do not have permission to write to the destination.'
        );
      }
    }

    await fsp.rename(this.absolutePath, destinationPath);
    try {
      const dirname = path.dirname(destinationPath);
      const basename = path.basename(destinationPath);
      const metaFilePath = path.join(dirname, `${basename}.nephelemeta`);
      try {
        await fsp.unlink(metaFilePath);
      } catch (e: any) {
        // Ignore errors deleting a possibly non-existend file.
      }

      const meta = await this.readMetadataFile();
      meta.locks = {};
      await this.saveMetadataFile(meta);

      await fsp.rename(await this.getMetadataFilePath(), metaFilePath);
    } catch (e: any) {
      // Ignore errors while moving metadata files.
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
    if (this.etag != null) {
      return this.etag;
    }

    const stat = await fsp.stat(this.absolutePath);

    let etag: string;
    if (
      (await this.isCollection()) ||
      stat.size / (1024 * 1024) > this.adapter.contentEtagMaxMB
    ) {
      etag = crc32
        .c(
          Buffer.from(
            `size: ${stat.size}; ctime: ${stat.ctimeMs}; mtime: ${stat.mtimeMs}`,
            'utf8'
          )
        )
        .toString(16);
    } else {
      etag = await new Promise(async (resolve, reject) => {
        const stream = (await this.getStream()).pipe(
          crc32.createHash({
            seed: 0,
            table: crc32.TABLE.CASTAGNOLI,
          })
        );
        stream.on('error', reject);
        stream.on('data', (buffer: Buffer) => {
          resolve(buffer.toString('hex'));
        });
      });
    }

    this.etag = etag;

    return this.etag;
  }

  async getMediaType() {
    if (await this.isCollection()) {
      return null;
    }

    const mediaType = mime.getType(path.basename(this.absolutePath));
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
    return path.basename(this.path);
  }

  async getCanonicalPath() {
    if (await this.isCollection()) {
      return this.path.replace(/\/?$/, () => '/');
    }
    return this.path;
  }

  async getCanonicalUrl() {
    return new URL(
      (await this.getCanonicalPath())
        .replace(/^\//, () => '')
        .split('/')
        .map(encodeURIComponent)
        .join('/'),
      this.baseUrl
    );
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
    const uid = await this.adapter.getUid(user);
    const gids = await this.adapter.getGids(user);

    if (user.uid != null) {
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
      if (name.endsWith('.nephelemeta')) {
        continue;
      }

      try {
        const absolutePath = path.join(this.absolutePath, name);
        const stats = await fsp.stat(absolutePath);
        // This adapter only supports directories, files, and symlinks.
        if (
          !stats.isDirectory() &&
          !stats.isFile() &&
          !stats.isSymbolicLink()
        ) {
          continue;
        }
      } catch (e: any) {
        continue;
      }

      resources.push(
        new Resource({
          path: path.join(this.path, name),
          baseUrl: this.baseUrl,
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

  async setMode(mode: number) {
    await fsp.chmod(this.absolutePath, mode);
    await fsp.chmod(await this.getMetadataFilePath(), mode);
  }

  async getFreeSpace() {
    const directory = (await this.isCollection())
      ? this.absolutePath
      : path.dirname(this.absolutePath);
    return (await checkDiskSpace(directory)).free;
  }

  async getTotalSpace() {
    const directory = (await this.isCollection())
      ? this.absolutePath
      : path.dirname(this.absolutePath);
    return (await checkDiskSpace(directory)).size;
  }

  async getMetadataFilePath() {
    if (await this.isCollection()) {
      return path.join(this.absolutePath, '.nephelemeta');
    } else {
      const dirname = path.dirname(this.absolutePath);
      const basename = path.basename(this.absolutePath);
      return path.join(dirname, `${basename}.nephelemeta`);
    }
  }

  async readMetadataFile() {
    const filepath = await this.getMetadataFilePath();
    let meta: MetaStorage = {};

    try {
      meta = JSON.parse((await fsp.readFile(filepath)).toString());
    } catch (e: any) {
      if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') {
        throw e;
      }
    }

    return meta;
  }

  async saveMetadataFile(meta: MetaStorage, filepath?: string) {
    if (!filepath) {
      filepath = await this.getMetadataFilePath();
    }
    let exists = true;

    try {
      await fsp.access(path.dirname(filepath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    try {
      await fsp.access(filepath, constants.F_OK);
    } catch (e: any) {
      exists = false;
    }

    if (
      (meta.props == null || Object.keys(meta.props).length === 0) &&
      (meta.locks == null || Object.keys(meta.locks).length === 0)
    ) {
      if (exists) {
        // Delete metadata file, since it should now be empty.
        await fsp.unlink(filepath);
      }
    } else {
      await fsp.writeFile(filepath, JSON.stringify(meta, null, 2));

      const stat = await fsp.stat(this.absolutePath);
      try {
        await fsp.chown(filepath, stat.uid, stat.gid);
        await fsp.chmod(filepath, stat.mode % 0o1000);
      } catch (e: any) {
        // Ignore errors on setting ownership of meta file.
      }
    }
  }

  async deleteOrphanedMetadataFiles() {
    if (!(await this.isCollection())) {
      throw new MethodNotSupportedError('This is not a collection.');
    }

    const listing = await fsp.readdir(this.absolutePath);
    const files: Set<string> = new Set();
    const metaFiles: Set<string> = new Set();

    for (let name of listing) {
      if (name === '.nephelemeta') {
        continue;
      }

      if (name.endsWith('.nephelemeta')) {
        metaFiles.add(name);
      } else {
        files.add(name);
      }
    }

    for (let name of files) {
      metaFiles.delete(`${name}.nephelemeta`);
    }

    const orphans = Array.from(metaFiles);

    for (let name of orphans) {
      const orphanPath = path.join(this.absolutePath, name);
      await fsp.unlink(orphanPath);
    }
  }
}
