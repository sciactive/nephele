import { Readable } from 'node:stream';
import fsp from 'node:fs/promises';
import type { Stats } from 'node:fs';
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
  // Don't use this directly. Call isCollection() instead.
  private collection: boolean | undefined = undefined;
  private etag: string | undefined = undefined;
  private stats: Stats | undefined = undefined;

  constructor({
    adapter,
    baseUrl,
    path: myPath,
    collection,
    stats,
  }: {
    adapter: Adapter;
    baseUrl: URL;
    path: string;
    collection?: boolean;
    stats?: Stats;
  }) {
    this.adapter = adapter;
    this.baseUrl = baseUrl;
    this.path = myPath.replace(
      new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
      '',
    );

    if (collection != null) {
      this.collection = collection;
    }

    if (stats) {
      this.stats = stats;
    }
  }

  get absolutePath() {
    return `${this.adapter.root}${path.sep}${this.path}`;
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
    stream.on('error', async () => {
      await handle.close();
    });
    stream.on('close', async () => {
      await handle.close();
    });

    return stream;
  }

  async setStream(input: Readable, user: User) {
    let exists = true;

    try {
      await fsp.access(path.dirname(this.absolutePath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.',
      );
    }

    if (await this.isCollection()) {
      throw new MethodNotSupportedError(
        'This resource is an existing collection.',
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
        await this.adapter.getGid(user),
      );
    }

    this.etag = undefined;

    const handle = await fsp.open(this.absolutePath, 'w');
    const stream = handle.createWriteStream();

    // Reset stats, since they are going to change.
    this.stats = undefined;

    input.pipe(stream);

    // Throttle throughput. Maybe add this as an option.

    // input.on('data', (chunk) => {
    //   if (!stream.write(chunk)) {
    //     input.pause();
    //     stream.once('drain', () => input.resume());
    //   } else {
    //     input.pause();
    //     setTimeout(() => input.resume(), 50);
    //   }
    // });

    // input.on('end', async () => {
    //   await stream.close();
    // });

    return new Promise<void>((resolve, reject) => {
      stream.on('close', async () => {
        await handle.close();
        resolve();
      });

      stream.on('error', async (err) => {
        input.destroy(err);
        await handle.close();
        reject(err);
      });

      input.on('error', async (err) => {
        stream.destroy(err);
        await handle.close();
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
        'One or more intermediate collections must be created before this resource.',
      );
    }

    if (this.collection) {
      await fsp.mkdir(this.absolutePath);
    } else {
      await fsp.writeFile(this.absolutePath, Uint8Array.from([]));
    }

    if (user.uid != null) {
      await fsp.chown(
        this.absolutePath,
        await this.adapter.getUid(user),
        await this.adapter.getGid(user),
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

      if (!this.stats) {
        this.stats = await fsp.stat(this.absolutePath);
      }

      if (
        !(
          this.stats.mode & otherWriteBit ||
          (this.stats.uid === uid && this.stats.mode & userWriteBit) ||
          (gids.includes(this.stats.gid) && this.stats.mode & groupWriteBit)
        )
      ) {
        throw new UnauthorizedError(
          'You do not have permission to delete this resource.',
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

    // Reset stats.
    this.stats = undefined;
  }

  async copy(destination: URL, baseUrl: URL, user: User) {
    const destinationPath = this.adapter.urlToAbsolutePath(
      destination,
      baseUrl,
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.',
      );
    }

    if (
      this.absolutePath === destinationPath ||
      ((await this.isCollection()) &&
        destinationPath.startsWith(
          this.absolutePath.replace(
            new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
            () => path.sep,
          ),
        ))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.',
      );
    }

    try {
      await fsp.access(path.dirname(destinationPath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.',
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
          'You do not have permission to access the destination.',
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
          'You do not have permission to write to the destination.',
        );
      }
    }

    let metaFilePath: string | undefined = undefined;
    if (await this.isCollection()) {
      try {
        const stat = await fsp.stat(destinationPath);
        if (stat.isDirectory()) {
          const metaFilePath = `${destinationPath}${path.sep}.nephelemeta`;
          const contents = await fsp.readdir(destinationPath);

          if (
            contents.length > 1 ||
            (contents.length === 1 && contents[0] !== metaFilePath)
          ) {
            throw new Error('Directory not empty.');
          }

          try {
            await fsp.unlink(metaFilePath);
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
        metaFilePath = `${destinationPath}${path.sep}.nephelemeta`;

        try {
          await fsp.unlink(metaFilePath);
        } catch (e: any) {
          // Ignore errors deleting a possibly non-existent file.
        }

        const meta = await this.readMetadataFile();
        meta.locks = {};
        await this.saveMetadataFile(meta, destinationPath, metaFilePath);
      } catch (e: any) {
        // Ignore errors while copying metadata files.
        metaFilePath = undefined;
      }
    } else {
      await fsp.copyFile(this.absolutePath, destinationPath);
      try {
        const dirname = path.dirname(destinationPath);
        const basename = path.basename(destinationPath);
        metaFilePath = `${dirname}${path.sep}${basename}.nephelemeta`;

        try {
          await fsp.unlink(metaFilePath);
        } catch (e: any) {
          // Ignore errors deleting a possibly non-existent file.
        }

        const meta = await this.readMetadataFile();
        meta.locks = {};
        await this.saveMetadataFile(meta, destinationPath, metaFilePath);
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
      if (!this.stats) {
        this.stats = await fsp.stat(this.absolutePath);
      }
      // Set permissions.
      await fsp.chmod(destinationPath, this.stats.mode % 0o1000);

      if (metaFilePath != null) {
        try {
          await fsp.chown(metaFilePath, uid, gid);
          await fsp.chmod(metaFilePath, this.stats.mode % 0o1000);
        } catch (e: any) {
          // Ignore errors chown/chmod a possibly non-existent file.
        }
      }
    }

    if (!this.stats) {
      this.stats = await fsp.stat(this.absolutePath);
    }

    // Copy mode.
    try {
      await fsp.chmod(destinationPath, this.stats.mode);
    } catch (e: any) {
      // Ignore errors copying mode.
    }

    // Copy dates.
    try {
      await fsp.utimes(destinationPath, this.stats.atime, this.stats.mtime);
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
      baseUrl,
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.',
      );
    }

    if (
      this.absolutePath === destinationPath ||
      ((await this.isCollection()) &&
        destinationPath.startsWith(
          this.absolutePath.replace(
            new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
            () => path.sep,
          ),
        ))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.',
      );
    }

    try {
      await fsp.access(path.dirname(destinationPath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.',
      );
    }

    // We need the user and group IDs.
    const uid = await this.adapter.getUid(user);
    const gids = await this.adapter.getGids(user);

    if (user.uid != null) {
      // Check if the user can move it.
      if (!this.stats) {
        this.stats = await fsp.stat(this.absolutePath);
      }

      if (
        !(
          this.stats.mode & otherWriteBit ||
          (this.stats.uid === uid && this.stats.mode & userWriteBit) ||
          (gids.includes(this.stats.gid) && this.stats.mode & groupWriteBit)
        )
      ) {
        throw new UnauthorizedError(
          'You do not have permission to move this resource.',
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
          'You do not have permission to access the destination.',
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
          'You do not have permission to write to the destination.',
        );
      }
    }

    const metaFilePath = await this.getMetadataFilePath();
    const meta = await this.readMetadataFile();
    await fsp.rename(this.absolutePath, destinationPath);
    try {
      const dirname = path.dirname(destinationPath);
      const basename = path.basename(destinationPath);
      const destMetaFilePath = `${dirname}${path.sep}${basename}.nephelemeta`;
      try {
        await fsp.unlink(destMetaFilePath);
      } catch (e: any) {
        // Ignore errors deleting a possibly non-existent file.
      }

      meta.locks = {};
      await this.saveMetadataFile(meta, destinationPath, destMetaFilePath);

      try {
        await fsp.unlink(metaFilePath);
      } catch (e: any) {
        // Ignore errors deleting a possibly non-existent file.
      }
    } catch (e: any) {
      // Ignore errors while moving metadata files.
    }

    // Reset stats.
    this.stats = undefined;
  }

  async getLength() {
    if (await this.isCollection()) {
      return 0;
    }

    if (!this.stats) {
      this.stats = await fsp.stat(this.absolutePath);
    }

    return this.stats.size;
  }

  async getEtag() {
    if (this.etag != null) {
      return this.etag;
    }

    if (!this.stats) {
      this.stats = await fsp.stat(this.absolutePath);
    }

    let etag: string;
    if (
      (await this.isCollection()) ||
      this.stats.size > this.adapter.contentEtagMaxBytes
    ) {
      etag = crc32
        .c(
          Buffer.from(
            `size: ${this.stats.size}; birthtime: ${this.stats.birthtimeMs}; mtime: ${this.stats.mtimeMs}`,
            'utf8',
          ),
        )
        .toString(16);
    } else {
      // Check if we can open the file.
      try {
        const handle = await fsp.open(this.absolutePath, 'r');
        await handle.close();
      } catch (e: any) {
        throw new Error('Resource is not accessible.');
      }
      try {
        etag = await new Promise(async (resolve, reject) => {
          const stream = (await this.getStream()).pipe(
            crc32.createHash({
              seed: 0,
              table: crc32.TABLE.CASTAGNOLI,
            }),
          );
          stream.on('error', reject);
          stream.on('data', (buffer: Buffer) => {
            resolve(buffer.toString('hex'));
          });
        });
      } catch (e: any) {
        throw new Error('Etag could not be calculated.');
      }
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
      return this.path.replace(
        new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
        () => path.sep,
      );
    }
    return this.path;
  }

  async getCanonicalUrl() {
    return new URL(
      (await this.getCanonicalPath())
        .split(path.sep)
        .map(encodeURIComponent)
        .join('/')
        .replace(/^\//, () => ''),
      this.baseUrl,
    );
  }

  async isCollection() {
    if (this.collection != null) {
      return this.collection;
    }

    try {
      if (!this.stats) {
        this.stats = await fsp.stat(this.absolutePath);
      }
      this.collection = this.stats.isDirectory();
      return this.collection;
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
      if (!this.stats) {
        this.stats = await fsp.stat(this.absolutePath);
      }

      if (
        !(
          this.stats.mode & otherExecuteBit ||
          (this.stats.uid === uid && this.stats.mode & userExecuteBit) ||
          (gids.includes(this.stats.gid) && this.stats.mode & groupExecuteBit)
        )
      ) {
        throw new UnauthorizedError(
          "You do not have permission to list this collection's members.",
        );
      }
    }

    const listing = await fsp.readdir(this.absolutePath, {
      withFileTypes: true,
    });
    const resources: Resource[] = [];

    for (let dir of listing) {
      if (dir.name.endsWith('.nephelemeta')) {
        continue;
      }

      try {
        // This adapter only supports directories, files, and symlinks.
        if (!dir.isDirectory() && !dir.isFile() && !dir.isSymbolicLink()) {
          continue;
        }

        resources.push(
          new Resource({
            path: `${this.path}${path.sep}${dir.name}`,
            baseUrl: this.baseUrl,
            adapter: this.adapter,
            collection: dir.isDirectory(),
          }),
        );
      } catch (e: any) {
        continue;
      }
    }

    return resources;
  }

  async exists() {
    if (this.stats && this.stats.birthtime != null) {
      return true;
    }

    try {
      await fsp.access(this.absolutePath, constants.F_OK);
    } catch (e: any) {
      return false;
    }

    return true;
  }

  async getStats() {
    if (!this.stats) {
      this.stats = await fsp.stat(this.absolutePath);
    }
    return this.stats;
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
      return `${this.absolutePath}${path.sep}.nephelemeta`;
    } else {
      const dirname = path.dirname(this.absolutePath);
      const basename = path.basename(this.absolutePath);
      return `${dirname}${path.sep}${basename}.nephelemeta`;
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

  async saveMetadataFile(
    meta: MetaStorage,
    filePath?: string,
    metaFilePath?: string,
  ) {
    if (!metaFilePath) {
      metaFilePath = await this.getMetadataFilePath();
    }
    let exists = true;

    try {
      await fsp.access(path.dirname(metaFilePath), constants.F_OK);
    } catch (e: any) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.',
      );
    }

    try {
      await fsp.access(metaFilePath, constants.F_OK);
    } catch (e: any) {
      exists = false;
    }

    if (
      (meta.props == null || Object.keys(meta.props).length === 0) &&
      (meta.locks == null || Object.keys(meta.locks).length === 0)
    ) {
      if (exists) {
        // Delete metadata file, since it should now be empty.
        await fsp.unlink(metaFilePath);
      }
    } else {
      await fsp.writeFile(metaFilePath, JSON.stringify(meta, null, 2));

      try {
        const stat = filePath
          ? await fsp.stat(filePath)
          : await this.getStats();
        await fsp.chown(metaFilePath, stat.uid, stat.gid);
        await fsp.chmod(metaFilePath, stat.mode % 0o1000);
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
      const orphanPath = `${this.absolutePath}${path.sep}${name}`;
      await fsp.unlink(orphanPath);
    }
  }
}
