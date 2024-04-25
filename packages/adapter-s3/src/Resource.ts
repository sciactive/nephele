import { Readable } from 'node:stream';
import path from 'node:path';
import {
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  NoSuchKey,
  NotFound,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import createDebug from 'debug';
import type { Resource as ResourceInterface, User } from 'nephele';
import {
  BadGatewayError,
  ForbiddenError,
  MethodNotSupportedError,
  ResourceExistsError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
} from 'nephele';

import type Adapter from './Adapter.js';
import Properties from './Properties.js';
import Lock from './Lock.js';

const debug = createDebug('nephele:adapter-s3');

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
  key: string;
  /** Metadata cache. */
  private meta: MetaStorage | undefined = undefined;
  /** Whether this is a brand new collection. */
  private createCollection: boolean | undefined = undefined;
  /** Whether this is a collection. */
  private collection: boolean | undefined = undefined;
  /** Whether this resource is in the storage backend. */
  private inStorage: boolean | undefined = undefined;
  private etag: string | undefined = undefined;
  private size: number | undefined = undefined;
  private contentType: string | undefined = undefined;
  private lastModified: Date | undefined = undefined;
  /** Resolves when the resource's metadata is ready to be read/written. */
  private metaReadyPromise = Promise.resolve();

  constructor({
    adapter,
    baseUrl,
    path: pathname,
    exists,
    collection,
  }: {
    adapter: Adapter;
    baseUrl: URL;
    path: string;
    exists?: boolean;
    collection?: boolean;
  }) {
    this.adapter = adapter;
    this.baseUrl = baseUrl;
    this.path = pathname;
    this.key = this.adapter.relativePathToKey(this.path);

    if (exists === false) {
      this.inStorage = false;
    }

    if (collection) {
      this.createCollection = !exists;
      this.collection = true;
    }
  }

  async getLocks() {
    const meta = await this.getMetadata();

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
    const meta = await this.getMetadata();

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

    try {
      debug('GetObjectCommand', this.key);
      const command = new GetObjectCommand({
        Bucket: this.adapter.bucket,
        Key: this.key,
        ...(range
          ? {
              Range: `bytes=${range.start}-${range.end}`,
            }
          : {}),
      });

      const data = await this.adapter.s3.send(command);
      const body = data.Body;

      if (body == null) {
        throw new Error('Object not returned by blob store.');
      }

      return body as Readable;
    } catch (e: any) {
      if (e instanceof NoSuchKey || e instanceof NotFound) {
        throw new ResourceNotFoundError();
      }
      throw e;
    }
  }

  async setStream(input: Readable, _user: User, mediaType?: string) {
    if (!(await this.resourceTreeExists())) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    if (await this.isCollection()) {
      throw new MethodNotSupportedError(
        'This resource is an existing collection.'
      );
    }

    const meta = await this.getMetadata();

    let resolve: () => void = () => {};
    let reject: (reason?: any) => void = () => {};
    this.metaReadyPromise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    debug('Upload', this.key, mediaType);
    const parallelUpload = new Upload({
      client: this.adapter.s3,
      params: {
        Bucket: this.adapter.bucket,
        Key: this.key,
        ContentType: mediaType,
        Body: input,
        Metadata: this.translateMetadata(meta),
      },
      queueSize: this.adapter.uploadQueueSize,
      leavePartsOnError: true,
    });

    try {
      const response = await parallelUpload.done();

      this.etag = response.ETag;
    } catch (e: any) {
      reject(e);
      throw e;
    }

    this.inStorage = true;
    resolve();

    try {
      await this.deleteEmptyDir(path.dirname(this.key));
    } catch (e: any) {
      // Ignore errors trying to delete potentially non-existent file.
    }
  }

  async create(_user: User) {
    if (await this.exists()) {
      throw new ResourceExistsError('A resource already exists here.');
    }

    if (!(await this.resourceTreeExists())) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    let command: PutObjectCommand;
    if (this.createCollection) {
      const emptyKey = `${this.key.replace(/\/?$/, () => '/')}.nepheleempty`;
      debug('PutObjectCommand', emptyKey);
      command = new PutObjectCommand({
        Bucket: this.adapter.bucket,
        Key: emptyKey,
        Body: Buffer.from([]),
      });
    } else {
      debug('PutObjectCommand', this.key);
      command = new PutObjectCommand({
        Bucket: this.adapter.bucket,
        Key: this.key,
        Body: Buffer.from([]),
      });
    }

    const response = await this.adapter.s3.send(command);

    this.etag = response.ETag;

    if (!this.createCollection) {
      this.inStorage = true;
    }

    try {
      await this.deleteEmptyDir(path.dirname(this.key));
    } catch (e: any) {
      // Ignore errors trying to delete potentially non-existent file.
    }
  }

  async delete(_user: User) {
    if (!(await this.exists())) {
      throw new ResourceNotFoundError("This resource couldn't be found.");
    }

    if ((await this.isCollection()) && (await this.isEmpty())) {
      await this.deleteEmptyDir(this.key);
    } else {
      debug('DeleteObjectCommand', this.key);
      const command = new DeleteObjectCommand({
        Bucket: this.adapter.bucket,
        Key: this.key,
      });

      await this.adapter.s3.send(command);

      try {
        this.createEmptyDir(path.dirname(this.key));
      } catch (e: any) {
        // Ignore errors trying to recreate empty dir file.
      }
    }

    this.etag = undefined;
    this.inStorage = false;
  }

  async copy(destination: URL, baseUrl: URL, user: User) {
    const destinationPath = this.adapter.urlToRelativePath(
      destination,
      baseUrl
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.'
      );
    }

    if (
      this.path === destinationPath ||
      ((await this.isCollection()) &&
        destinationPath.startsWith(
          this.path.replace(
            new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
            () => path.sep
          )
        ))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.'
      );
    }

    const destinationKey = this.adapter.relativePathToKey(destinationPath);

    if (!(await this.resourceTreeExists(destinationKey))) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    let meta = await this.getMetadata();
    meta.locks = {};

    if (await this.isCollection()) {
      try {
        const destinationResource = await this.adapter.getResource(
          destination,
          this.baseUrl
        );

        if (await destinationResource.isCollection()) {
          if (!(await destinationResource.isEmpty())) {
            throw new Error('Directory not empty.');
          }

          try {
            await destinationResource.delete(user);
          } catch (e: any) {
            // Ignore errors deleting possible non-existent file.
          }
        } else {
          await destinationResource.delete(user);
        }
      } catch (e: any) {
        // Ignore errors stat-ing a possible non-existent directory and deleting
        // a possibly non-empty directory.
      }

      const metadata = this.translateMetadata(meta);

      if (await this.existsInStorage()) {
        debug('CopyObjectCommand', destinationKey);
        const command = new CopyObjectCommand({
          Bucket: this.adapter.bucket,
          CopySource: `${this.adapter.bucket}/${this.key}`,
          Key: destinationKey,
          Metadata: metadata,
          MetadataDirective: 'REPLACE',
        });

        await this.adapter.s3.send(command);
      } else {
        const emptyKey = `${destinationKey.replace(
          /\/?$/,
          () => '/'
        )}.nepheleempty`;
        debug('PutObjectCommand', emptyKey);
        const command = new PutObjectCommand({
          Bucket: this.adapter.bucket,
          Key: emptyKey,
          Metadata: { ...metadata },
          Body: Buffer.from([]),
        });

        await this.adapter.s3.send(command);
      }
    } else {
      const metadata = this.translateMetadata(meta);

      debug('CopyObjectCommand', destinationKey);
      const command = new CopyObjectCommand({
        Bucket: this.adapter.bucket,
        CopySource: `${this.adapter.bucket}/${this.key}`,
        Key: destinationKey,
        Metadata: metadata,
        MetadataDirective: 'REPLACE',
      });

      await this.adapter.s3.send(command);
    }

    try {
      await this.deleteEmptyDir(path.dirname(destinationKey));
    } catch (e: any) {
      // Ignore errors trying to delete potentially non-existent file.
    }
  }

  async move(destination: URL, baseUrl: URL, user: User) {
    if (await this.isCollection()) {
      throw new Error('Move called on a collection resource.');
    }

    const destinationPath = this.adapter.urlToRelativePath(
      destination,
      baseUrl
    );

    if (destinationPath == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.'
      );
    }

    if (
      this.path === destinationPath ||
      ((await this.isCollection()) &&
        destinationPath.startsWith(
          this.path.replace(
            new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
            () => path.sep
          )
        ))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.'
      );
    }

    const destinationKey = this.adapter.relativePathToKey(destinationPath);

    if (!(await this.resourceTreeExists(destinationKey))) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    try {
      const destinationResource = await this.adapter.getResource(
        destination,
        baseUrl
      );
      if (
        (await destinationResource.isCollection()) &&
        !(await destinationResource.isEmpty())
      ) {
        throw new ForbiddenError(
          'The destination cannot be an existing non-empty directory.'
        );
      }
    } catch (e: any) {
      if (!(e instanceof ResourceNotFoundError)) {
        throw e;
      }
    }

    const meta = await this.getMetadata();
    meta.locks = {};
    const metadata = this.translateMetadata(meta);

    debug('CopyObjectCommand', destinationKey);
    const command = new CopyObjectCommand({
      Bucket: this.adapter.bucket,
      CopySource: `${this.adapter.bucket}/${this.key}`,
      Key: destinationKey,
      Metadata: metadata,
      MetadataDirective: 'REPLACE',
    });

    await this.adapter.s3.send(command);
    await this.delete(user);

    try {
      await this.deleteEmptyDir(path.dirname(destinationKey));
    } catch (e: any) {
      // Ignore errors trying to delete potentially non-existent file.
    }
  }

  async getLength() {
    if (await this.isCollection()) {
      return 0;
    }

    if (this.size != null) {
      return this.size;
    }

    await this.getMetadata();

    return this.size ?? 0;
  }

  async getEtag() {
    if (this.etag != null) {
      return this.etag;
    }

    if (!(await this.exists())) {
      throw new ResourceNotFoundError();
    }

    return this.etag ?? 'default-etag';
  }

  async getMediaType() {
    if (await this.isCollection()) {
      return null;
    }

    if (this.contentType != null) {
      return this.contentType;
    }

    await this.getMetadata();

    return this.contentType ?? null;
  }

  async getLastModified() {
    if (this.lastModified != null) {
      return this.lastModified;
    }

    if (!(await this.exists())) {
      throw new ResourceNotFoundError();
    }

    return this.lastModified ?? null;
  }

  async getCanonicalName() {
    return path.basename(this.path);
  }

  async getCanonicalPath() {
    if (await this.isCollection()) {
      return this.path.replace(
        new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
        () => path.sep
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
      this.baseUrl
    );
  }

  async *listKeys(prefix?: string, maxKeys?: number) {
    const command = new ListObjectsV2Command({
      Bucket: this.adapter.bucket,
      MaxKeys: maxKeys,
      Delimiter: '/',
      ...(prefix && prefix !== '/'
        ? {
            Prefix: prefix.replace(/\/?$/, () => '/'),
          }
        : {}),
    });

    let isTruncated: boolean | undefined = true;

    while (isTruncated) {
      const { CommonPrefixes, Contents, IsTruncated, NextContinuationToken } =
        await this.adapter.s3.send(command);
      if (CommonPrefixes == null && Contents == null) {
        break;
      }

      if (CommonPrefixes != null) {
        for (let prefix of CommonPrefixes) {
          if (prefix.Prefix != null && prefix.Prefix !== prefix) {
            yield { key: `${prefix.Prefix}`, size: 0, type: 'collection' };
          }
        }
      }
      if (Contents != null) {
        for (let content of Contents) {
          if (content.Key !== prefix) {
            yield {
              key: `${content.Key}`,
              size: content.Size || 0,
              type: 'unknown',
            };
          }
        }
      }
      isTruncated = IsTruncated;
      command.input.ContinuationToken = NextContinuationToken;
    }
  }

  async isCollection() {
    if (this.collection != null) {
      return this.collection;
    }
    if (this.createCollection || this.isRoot()) {
      return true;
    }

    const keys = this.listKeys(
      this.key.replace(/\/?$/, () => '/'),
      1
    );

    for await (let key of keys) {
      if (key) {
        this.collection = true;
        return true;
      }
    }

    const collection = await this.existsInStorage(
      `${this.key.replace(/\/?$/, () => '/')}.nepheleempty`
    );
    this.collection = collection;
    return this.collection;
  }

  async isEmpty() {
    if (this.createCollection) {
      return true;
    }

    const keys = this.listKeys(
      this.key.replace(/\/?$/, () => '/'),
      1
    );

    for await (let key of keys) {
      if (key && key.key !== `${this.key}/.nepheleempty`) {
        return false;
      }
    }

    return true;
  }

  isRoot(key = this.key) {
    return key === '' || key.replace(/\/?$/, () => '/') === '/';
  }

  async getInternalMembers(_user: User) {
    if (!(await this.isCollection())) {
      throw new MethodNotSupportedError('This is not a collection.');
    }

    const keys = this.listKeys(this.key.replace(/\/?$/, () => '/'));
    const collections: { [k: string]: Resource } = {};
    const resources: { [k: string]: Resource } = {};

    for await (let key of keys) {
      if (key.type === 'collection') {
        collections[key.key] = new Resource({
          path: this.adapter.keyToRelativePath(key.key),
          baseUrl: this.baseUrl,
          adapter: this.adapter,
          exists: true,
          collection: true,
        });
      } else {
        resources[key.key] = new Resource({
          path: this.adapter.keyToRelativePath(key.key),
          baseUrl: this.baseUrl,
          adapter: this.adapter,
          exists: true,
          collection: false,
        });
      }
    }

    // Check for an empty object and see if there are other objects in the dir.
    const emptyKey = `${this.key.replace(/\/?$/, () => '/')}.nepheleempty`;
    if (emptyKey in resources) {
      delete resources[emptyKey];

      if (Object.keys(collections).length || Object.keys(resources).length) {
        // Delete the empty object for a collection resource that has children.
        debug('DeleteObjectCommand', emptyKey);
        const command = new DeleteObjectCommand({
          Bucket: this.adapter.bucket,
          Key: emptyKey,
        });

        await this.adapter.s3.send(command);
      }
    }

    return [...Object.values(collections), ...Object.values(resources)];
  }

  async exists(key = this.key) {
    if (this.isRoot(key) || (await this.existsInStorage(key))) {
      return true;
    }

    // Check for resource under this one.
    const keys = this.listKeys(
      key.replace(/\/?$/, () => '/'),
      1
    );
    for await (let _key of keys) {
      return true;
    }

    return false;
  }

  async existsInStorage(key = this.key) {
    // Only check if it exists in storage.

    if (this.isRoot(key)) {
      return false;
    }

    if (key === this.key && this.inStorage != null) {
      return this.inStorage;
    }

    await this.metaReadyPromise;

    try {
      debug('HeadObjectCommand', key);
      const command = new HeadObjectCommand({
        Bucket: this.adapter.bucket,
        Key: key,
      });

      const response = await this.adapter.s3.send(command);

      if (key === this.key) {
        this.etag = response.ETag;
        this.size = response.ContentLength;
        this.contentType = response.ContentType;
        this.lastModified = response.LastModified;

        this.meta = {};
        this.meta.props = JSON.parse(
          response.Metadata?.['nephele-properties'] ?? '{}'
        );
        this.meta.locks = JSON.parse(
          response.Metadata?.['nephele-locks'] ?? '{}'
        );
      }
    } catch (e: any) {
      if (e instanceof NoSuchKey || e instanceof NotFound) {
        if (key === this.key) {
          this.inStorage = false;
        }
        return false;
      }
      throw e;
    }

    if (key === this.key) {
      this.inStorage = true;
    }
    return true;
  }

  async resourceTreeExists(key = this.key) {
    // We're going to say that a resource tree always exists, since you can
    // create "directories" in S3 just by adding an object with that key prefix.
    return true;

    // If we actually did want to check, here's how we'd do it.
    // let pathname = this.adapter.keyToRelativePath(key);
    // let dirname = path.dirname(pathname);

    // try {
    //   while (dirname != '.') {
    //     const dirkey = this.adapter.relativePathToKey(dirname);
    //     debug('GetObjectAttributesCommand', dirkey);
    //     const command = new GetObjectAttributesCommand({
    //       Bucket: this.adapter.bucket,
    //       Key: dirkey,
    //       ObjectAttributes: [],
    //     });

    //     await this.adapter.s3.send(command);
    //     dirname = path.dirname(dirname);
    //   }
    // } catch (e: any) {
    //   if (e instanceof NoSuchKey || e instanceof NotFound) {
    //     return false;
    //   }
    //   throw e;
    // }

    // return true;
  }

  async createEmptyDir(key: string) {
    if (key === '' || key === '/' || key === '.') {
      return;
    }

    const keys = this.listKeys(key, 1);

    for await (let key of keys) {
      if (key) {
        return;
      }
    }

    const emptyKey = `${key.replace(/\/?$/, () => '/')}.nepheleempty`;
    debug('PutObjectCommand', emptyKey);
    const command = new PutObjectCommand({
      Bucket: this.adapter.bucket,
      Key: emptyKey,
      Body: Buffer.from([]),
    });

    await this.adapter.s3.send(command);
  }

  async deleteEmptyDir(key: string) {
    if (key === '' || key === '/' || key === '.') {
      return;
    }

    const emptyKey = `${key.replace(/\/?$/, () => '/')}.nepheleempty`;
    debug('DeleteObjectCommand', emptyKey);
    const command = new DeleteObjectCommand({
      Bucket: this.adapter.bucket,
      Key: emptyKey,
    });
    await this.adapter.s3.send(command);
  }

  async getMetadata(): Promise<MetaStorage> {
    if (this.meta != null) {
      return this.meta;
    }

    if (this.isRoot()) {
      this.meta = {};
      return this.meta;
    }

    this.meta = {};

    await this.metaReadyPromise;

    try {
      debug('HeadObjectCommand', this.key);
      const command = new HeadObjectCommand({
        Bucket: this.adapter.bucket,
        Key: this.key,
      });

      const response = await this.adapter.s3.send(command);

      this.etag = response.ETag;
      this.size = response.ContentLength;
      this.contentType = response.ContentType;
      this.lastModified = response.LastModified;

      this.meta.props = JSON.parse(
        response.Metadata?.['nephele-properties'] ?? '{}'
      );
      this.meta.locks = JSON.parse(
        response.Metadata?.['nephele-locks'] ?? '{}'
      );

      this.inStorage = true;
    } catch (e: any) {
      if (!(e instanceof NotFound || e instanceof NoSuchKey)) {
        this.inStorage = false;
        throw e;
      }
    }

    return this.meta;
  }

  /**
   * Translate metadata into the format S3 expects.
   */
  translateMetadata(meta: MetaStorage) {
    const metadata: { [k: string]: string } = {};
    const props = meta.props ?? {};
    const locks = meta.locks ?? {};

    metadata['nephele-properties'] = JSON.stringify(props);
    metadata['nephele-locks'] = JSON.stringify(locks);

    return metadata;
  }

  async saveMetadata(meta: MetaStorage) {
    const metadata = this.translateMetadata(meta);

    await this.metaReadyPromise;

    if (this.inStorage === false) {
      this.meta = meta;
      return;
    }

    try {
      // Changing metadata in S3 is accomplished by copying an object to its own
      // key and updating the metadata during copy.
      debug('CopyObjectCommand', this.key, metadata);
      const command = new CopyObjectCommand({
        Bucket: this.adapter.bucket,
        CopySource: `${this.adapter.bucket}/${this.key}`,
        Key: this.key,
        Metadata: metadata,
        MetadataDirective: 'REPLACE',
      });

      const response = await this.adapter.s3.send(command);
      this.etag = response.CopyObjectResult?.ETag ?? this.etag;
      this.lastModified =
        response.CopyObjectResult?.LastModified ?? this.lastModified;

      this.meta = meta;
    } catch (e: any) {
      if (e instanceof NoSuchKey || e instanceof NotFound) {
        this.meta = meta;
      } else {
        throw e;
      }
    }
  }
}
