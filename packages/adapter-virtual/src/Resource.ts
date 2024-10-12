import { Readable } from 'node:stream';
import mime from 'mime';
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
import type { RootFolder, Folder, File } from './Adapter.js';
import Properties from './Properties.js';
import Lock from './Lock.js';

export default class Resource implements ResourceInterface {
  adapter: Adapter;
  baseUrl: URL;
  path: string;
  file: RootFolder | Folder | File;
  exists: boolean;
  collection: boolean;

  constructor({
    adapter,
    baseUrl,
    path: filePath,
    collection,
  }: {
    adapter: Adapter;
    baseUrl: URL;
    path: string;
    collection?: true;
  }) {
    this.adapter = adapter;
    this.baseUrl = baseUrl;
    this.path = filePath;

    const basename = this.adapter.basename(this.path);
    const file = this.getFile();

    this.exists = !!file;
    this.file =
      file != null
        ? file
        : collection
          ? {
              name: basename,
              properties: {
                creationdate: new Date(),
                getlastmodified: new Date(),
              },
              locks: {},
              children: [],
            }
          : {
              name: basename,
              properties: {
                creationdate: new Date(),
                getlastmodified: new Date(),
              },
              locks: {},
              content: Buffer.from([]),
            };
    this.collection = 'children' in this.file;
  }

  getFile() {
    const barePath = this.path.replace(/^\//, '').replace(/\/$/, '');

    if (barePath === '') {
      return this.adapter.files;
    }

    const pathParts = barePath.split('/');

    let current: RootFolder | Folder | File | undefined = this.adapter.files;
    do {
      const part = pathParts.shift();

      if (!part || part === '.') {
        return undefined;
      }

      if (current == null || !('children' in current)) {
        return undefined;
      }

      current = current.children.find((child) => child.name === part);
    } while (pathParts.length);

    return current;
  }

  setFile(file: RootFolder | Folder | File) {
    const barePath = this.path.replace(/^\//, '').replace(/\/$/, '');

    if (barePath === '') {
      if ('name' in file || 'content' in file) {
        throw new Error('Tried to set root folder to non-root entry.');
      }
      this.adapter.files = file;
      return;
    }

    const parentParts = this.adapter.dirname(barePath).split('/');
    const basename = this.adapter.basename(barePath);

    let parent: RootFolder | Folder = this.adapter.files;
    do {
      const part = parentParts.shift();

      if (!part || part === '.') {
        break;
      }

      if (parent == null || !('children' in parent)) {
        throw new ResourceTreeNotCompleteError(
          'One or more intermediate collections must be created before this resource.',
        );
      }

      parent = parent.children.find(
        (child) => 'children' in child && child.name === part,
      ) as Folder;
    } while (parentParts.length);

    let current: Folder | File | undefined = parent.children.find(
      (child) => child.name === basename,
    );

    if (current) {
      if ('name' in file) {
        (current as File).name = file.name;
      }
      if ('content' in file) {
        (current as File).content = file.content;
      }
      current.properties = file.properties;
      current.locks = file.locks;

      this.file = current;
    } else {
      parent.children.push(file as Folder | File);
      this.file = file;
    }

    if (
      !('creationdate' in this.file.properties) ||
      this.file.properties.creationdate == null
    ) {
      this.file.properties.creationdate = new Date();
    }
    this.file.properties.getlastmodified = new Date();
    this.collection = 'children' in this.file;
    this.exists = true;
  }

  unsetFile() {
    const barePath = this.path.replace(/^\//, '').replace(/\/$/, '');

    if (barePath === '') {
      throw new Error('Tried to delete root folder.');
    }

    const parentParts = this.adapter.dirname(barePath).split('/');
    const basename = this.adapter.basename(barePath);

    let parent: RootFolder | Folder = this.adapter.files;
    do {
      const part = parentParts.shift();

      if (!part || part === '.') {
        break;
      }

      if (parent == null || !('children' in parent)) {
        throw new ResourceNotFoundError('The resource does not exist.');
      }

      parent = parent.children.find(
        (child) => 'children' in child && child.name === part,
      ) as Folder;
    } while (parentParts.length);

    let index = parent.children.findIndex((child) => child.name === basename);

    if (index !== -1) {
      parent.children.splice(index, 1);
      this.exists = false;
    }
  }

  async getLocks() {
    return Object.entries(this.file.locks).map(([token, entry]) => {
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
    return Object.entries(this.file.locks)
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
    if (!('content' in this.file)) {
      return Readable.from([]);
    }

    if (range) {
      return Readable.from(this.file.content.subarray(range.start, range.end));
    }

    return Readable.from(this.file.content);
  }

  async setStream(input: Readable, user: User) {
    if (!('content' in this.file)) {
      throw new MethodNotSupportedError(
        'This resource is an existing collection.',
      );
    }

    const dir = new Resource({
      adapter: this.adapter,
      baseUrl: this.baseUrl,
      path: this.adapter.dirname(this.path),
    }).getFile();

    if (dir == null) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.',
      );
    }

    if (
      'owner' in this.file.properties &&
      this.file.properties.owner !== user.username
    ) {
      throw new UnauthorizedError(
        'You do not have permission to modify this resource.',
      );
    }

    this.file.content = await new Promise((resolve, reject) => {
      const bufs: Buffer[] = [];

      input.on('data', (chunk) => {
        bufs.push(chunk);
      });

      input.on('error', (error) => {
        reject(error);
      });

      input.on('end', () => {
        resolve(Buffer.concat(bufs));
      });
    });

    this.setFile(this.file);
  }

  async create(user: User) {
    if (this.exists) {
      throw new ResourceExistsError('A resource already exists here.');
    }

    if (!('owner' in this.file.properties)) {
      this.file.properties.owner = user.username;
    }

    this.setFile(this.file);
  }

  async delete(user: User) {
    if (!this.exists) {
      throw new ResourceNotFoundError("This resource couldn't be found.");
    }

    if (
      'owner' in this.file.properties &&
      this.file.properties.owner !== user.username
    ) {
      throw new UnauthorizedError(
        'You do not have permission to delete this resource.',
      );
    }

    if ('children' in this.file && this.file.children.length) {
      throw new ForbiddenError('This collection is not empty.');
    }

    this.unsetFile();
  }

  async copy(destination: URL, baseUrl: URL, user: User) {
    const destinationPath = this.adapter.urlToRelativePath(
      destination,
      baseUrl,
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.',
      );
    }

    if (
      this.path === destinationPath ||
      (!('content' in this.file) &&
        destinationPath.startsWith(this.path.replace(/\/?$/, () => '/')))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.',
      );
    }

    try {
      const parent = await this.adapter.getResource(
        new URL(
          this.adapter
            .dirname(destinationPath)
            .split('/')
            .map(encodeURIComponent)
            .join('/'),
          baseUrl,
        ),
        baseUrl,
      );

      if (
        'owner' in parent.file.properties &&
        parent.file.properties.owner !== user.username
      ) {
        throw new UnauthorizedError(
          "You don't have permission to copy the resource to this destination.",
        );
      }
    } catch (e: any) {
      if (e instanceof ResourceNotFoundError) {
        throw new ResourceTreeNotCompleteError(
          'One or more intermediate collections must be created before this resource.',
        );
      }
      throw e;
    }

    let destinationResource: Resource;
    try {
      destinationResource = await this.adapter.getResource(
        destination,
        baseUrl,
      );
      if (
        'owner' in destinationResource.file.properties &&
        destinationResource.file.properties.owner !== user.username
      ) {
        throw new UnauthorizedError(
          "You don't have permission to modify the destination.",
        );
      }
    } catch (e: any) {
      if (this.collection) {
        destinationResource = await this.adapter.newCollection(
          destination,
          baseUrl,
        );
      } else {
        destinationResource = await this.adapter.newResource(
          destination,
          baseUrl,
        );
      }
    }

    let file: Folder | File;
    if ('content' in this.file) {
      file = {
        name: this.adapter.basename(destinationPath),
        properties: JSON.parse(JSON.stringify(this.file.properties)),
        locks: {},
        content: Buffer.from(this.file.content),
      };
    } else {
      file = {
        name: this.adapter.basename(destinationPath),
        properties: JSON.parse(JSON.stringify(this.file.properties)),
        locks: {},
        children: [],
      };
    }

    file.properties.creationdate = new Date();
    file.properties.getlastmodified = this.file.properties.getlastmodified;
    file.properties.owner = user.username;

    destinationResource.setFile(file);
  }

  async move(destination: URL, baseUrl: URL, user: User) {
    if (!('content' in this.file)) {
      throw new Error('Move called on a collection resource.');
    }

    const destinationPath = this.adapter.urlToRelativePath(
      destination,
      baseUrl,
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.',
      );
    }

    if (
      this.path === destinationPath ||
      (!('content' in this.file) &&
        destinationPath.startsWith(this.path.replace(/\/?$/, () => '/')))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.',
      );
    }

    if (
      'owner' in this.file.properties &&
      this.file.properties.owner !== user.username
    ) {
      throw new UnauthorizedError(
        "You don't have permission to move the resource.",
      );
    }

    try {
      const parent = await this.adapter.getResource(
        new URL(this.adapter.dirname(destination.toString())),
        baseUrl,
      );

      if (
        'owner' in parent.file.properties &&
        parent.file.properties.owner !== user.username
      ) {
        throw new UnauthorizedError(
          "You don't have permission to move the resource to this destination.",
        );
      }
    } catch (e: any) {
      if (e instanceof ResourceNotFoundError) {
        throw new ResourceTreeNotCompleteError(
          'One or more intermediate collections must be created before this resource.',
        );
      }
      throw e;
    }

    let destinationResource: Resource;
    try {
      destinationResource = await this.adapter.getResource(
        destination,
        baseUrl,
      );
      if (
        'owner' in destinationResource.file.properties &&
        destinationResource.file.properties.owner !== user.username
      ) {
        throw new UnauthorizedError(
          "You don't have permission to modify the destination.",
        );
      }
    } catch (e: any) {
      destinationResource = await this.adapter.newResource(
        destination,
        baseUrl,
      );
    }

    if (
      'children' in destinationResource.file &&
      destinationResource.file.children.length
    ) {
      throw new ForbiddenError('The destination is not empty.');
    }

    this.unsetFile();
    destinationResource.setFile({
      ...this.file,
      name: this.adapter.basename(destinationPath),
      locks: {},
    });
  }

  async getLength() {
    if (!('content' in this.file)) {
      return 0;
    }

    return this.file.content.byteLength;
  }

  async getEtag() {
    const etag = crc32
      .c(
        Buffer.from(
          `size: ${
            ('content' in this.file ? this.file.content : Buffer.from([]))
              .byteLength
          }; birthtime: ${this.file.properties.creationdate.getTime()}; mtime: ${this.file.properties.getlastmodified.getTime()}`,
          'utf8',
        ),
      )
      .toString(16);

    return etag;
  }

  async getMediaType() {
    return await new Promise<string | null>((resolve, reject) => {
      if (!('content' in this.file)) {
        resolve(null);
        return;
      }

      const mediaType = mime.getType(this.file.name);
      if (!mediaType) {
        resolve('application/octet-stream');
      } else if (Array.isArray(mediaType)) {
        resolve(
          typeof mediaType[0] === 'string'
            ? mediaType[0]
            : 'application/octet-stream',
        );
      } else if (typeof mediaType === 'string') {
        resolve(mediaType);
      } else {
        resolve('application/octet-stream');
      }
    });
  }

  async getCanonicalName() {
    return 'name' in this.file
      ? this.file.name
      : this.adapter.basename(this.path);
  }

  async getCanonicalPath() {
    if (!('content' in this.file)) {
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
      this.baseUrl,
    );
  }

  async isCollection() {
    return 'children' in this.file;
  }

  async getInternalMembers(_user: User) {
    if (!('children' in this.file)) {
      throw new MethodNotSupportedError('This is not a collection.');
    }

    const resources: Resource[] = [];

    for (let file of this.file.children) {
      resources.push(
        new Resource({
          path: this.path.replace(/\/?$/, () => '/') + file.name,
          baseUrl: this.baseUrl,
          adapter: this.adapter,
        }),
      );
    }

    return resources;
  }
}
