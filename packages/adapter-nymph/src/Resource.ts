import { Readable } from 'node:stream';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import checkDiskSpace from 'check-disk-space';
import { BackPressureTransform } from '@sciactive/back-pressure-transform';
import { v4 as uuidv4 } from 'uuid';
import { TilmeldAccessLevels } from '@nymphjs/nymph';
import { User as NymphUser, enforceTilmeld } from '@nymphjs/tilmeld';
import type { Resource as ResourceInterface, User } from 'nephele';
import {
  BadGatewayError,
  ForbiddenError,
  InternalServerError,
  MethodNotSupportedError,
  ResourceExistsError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
  UnauthorizedError,
} from 'nephele';

import {
  Resource as NymphResource,
  ResourceData as NymphResourceData,
} from './entities/Resource.js';

import type Adapter from './Adapter.js';
import Properties from './Properties.js';
import Lock from './Lock.js';
import { EMPTY_HASH } from './constants.js';

export default class Resource implements ResourceInterface {
  adapter: Adapter;
  baseUrl: URL;
  path: string;
  nymphResource: NymphResource & NymphResourceData;
  rootResource: NymphResource & NymphResourceData;

  constructor({
    adapter,
    baseUrl,
    path,
    nymphResource,
    rootResource,
  }: {
    adapter: Adapter;
    baseUrl: URL;
    path: string;
    nymphResource: NymphResource & NymphResourceData;
    rootResource?: NymphResource & NymphResourceData;
  }) {
    this.adapter = adapter;
    this.baseUrl = baseUrl;
    this.path = path;
    this.nymphResource = nymphResource;
    this.rootResource = rootResource ?? nymphResource;
  }

  async getLocks() {
    const nymphLocks = await this.adapter.nymph.getEntities(
      { class: this.adapter.NymphLock },
      {
        type: '&',
        ref: ['resource', this.nymphResource],
      },
    );

    return nymphLocks.map(
      (nymphLock) => new Lock({ resource: this, nymphLock }),
    );
  }

  async getLocksByUser(user: User) {
    const nymphLocks = await this.adapter.nymph.getEntities(
      { class: this.adapter.NymphLock },
      {
        type: '&',
        ref: ['resource', this.nymphResource],
        equal: ['username', user.username],
      },
    );

    return nymphLocks.map(
      (nymphLock) => new Lock({ resource: this, nymphLock }),
    );
  }

  async createLockForUser(user: User) {
    const nymphLock = await this.adapter.NymphLock.factory();

    nymphLock.username = user.username;
    nymphLock.resource = this.nymphResource;

    return new Lock({ resource: this, nymphLock });
  }

  async getProperties() {
    return new Properties({ resource: this });
  }

  private getBlobDirname(hash?: string) {
    const threeBytes = (hash ?? this.nymphResource?.hash ?? EMPTY_HASH).slice(
      0,
      6,
    );
    const dirname = path.resolve(
      this.adapter.blobRoot,
      threeBytes.slice(0, 2),
      threeBytes.slice(2, 4),
      threeBytes.slice(4, 6),
    );
    return dirname;
  }

  private async deleteBlobIfOrphaned(hash: string) {
    if (
      hash === EMPTY_HASH ||
      (await this.adapter.nymph.getEntity(
        { class: this.adapter.NymphResource, skipAc: true },
        { type: '&', equal: ['hash', hash] },
      ))
    ) {
      return;
    }

    try {
      // Delete the blob.
      const blobDir = this.getBlobDirname(hash);
      await fsp.unlink(path.resolve(blobDir, hash));

      // Delete the dir(s) if empty.
      await fsp.rmdir(blobDir);

      const blob2Dir = path.dirname(blobDir);
      await fsp.rmdir(blob2Dir);

      const blob3Dir = path.dirname(blob2Dir);
      await fsp.rmdir(blob3Dir);
    } catch (e: any) {
      if (e.code !== 'ENOTEMPTY' && e.code !== 'ENOENT') {
        throw e;
      }
    }
  }

  async getStream(range?: { start: number; end: number }) {
    if (
      this.nymphResource.guid == null ||
      this.nymphResource.hash === EMPTY_HASH ||
      (await this.isCollection())
    ) {
      return Readable.from([]);
    }

    const filename = path.resolve(
      this.getBlobDirname(),
      this.nymphResource.hash,
    );

    const handle = await fsp.open(filename, 'r');

    const stream = handle.createReadStream(range ? range : undefined);
    stream.on('error', async () => {
      await handle.close();
    });
    stream.on('close', async () => {
      await handle.close();
    });

    return stream;
  }

  async setStream(input: Readable, _user: User, mediaType?: string) {
    if (await this.isCollection()) {
      throw new MethodNotSupportedError(
        'This resource is an existing collection.',
      );
    }

    // Save the entity, so it exists in the file structure if it's new. (Also,
    // make sure we have write permission.)
    if (!(await this.nymphResource.$save())) {
      throw new InternalServerError("Couldn't save resource entity.");
    }

    // Create a temporary file.
    try {
      await fsp.access(this.adapter.tempRoot, constants.F_OK);
    } catch (e: any) {
      await fsp.mkdir(this.adapter.tempRoot);
    }
    const tempFilename = path.resolve(this.adapter.tempRoot, uuidv4());

    const handle = await fsp.open(tempFilename, 'w');
    const stream = handle.createWriteStream();

    let size = 0;
    const cryptoHash = crypto.createHash('sha384');
    let hashResolve: (hash: string) => void;
    const hashPromise = new Promise<string>(
      (resolve) => (hashResolve = resolve),
    );
    const hashStream = new BackPressureTransform(
      async (chunk) => {
        if (!cryptoHash.write(Buffer.from(chunk))) {
          input.pause();

          cryptoHash.once('drain', () => {
            input.resume();
          });
        }
        size += chunk.length;
        return chunk;
      },
      async () => {
        hashResolve(cryptoHash.digest('hex'));
        cryptoHash.destroy();
      },
    );

    input.pipe(hashStream.writable);
    hashStream.readable.pipe(stream);

    return await new Promise<void>((resolve, reject) => {
      stream.on('close', async () => {
        await handle.close();
        hashStream.writable.destroy();
        hashStream.readable.destroy();

        const hash = await hashPromise;
        const transaction = `nephele-hash-${hash}`;
        const nymph = this.nymphResource.$nymph;
        const tnymph =
          await this.nymphResource.$nymph.startTransaction(transaction);
        this.nymphResource.$setNymph(tnymph);

        const oldHash = this.nymphResource.hash;

        try {
          this.nymphResource.hash = hash;
          this.nymphResource.size = size;
          this.nymphResource.contentType =
            (await fileTypeFromFile(tempFilename))?.mime ??
            mediaType ??
            'application/octet-stream';
          if (!(await this.nymphResource.$save())) {
            throw new InternalServerError("Couldn't save resource entity.");
          }

          // Move temp file to final destination.
          const dirname = this.getBlobDirname();
          const filename = path.resolve(dirname, hash);

          try {
            await fsp.access(dirname, constants.F_OK);
          } catch (e: any) {
            await fsp.mkdir(dirname, { recursive: true });
          }

          await fsp.rename(tempFilename, filename);

          await tnymph.commit(transaction);
          this.nymphResource.$setNymph(nymph);
        } catch (e: any) {
          await tnymph.rollback(transaction);
          this.nymphResource.$setNymph(nymph);

          try {
            await fsp.unlink(tempFilename);
          } catch (e: any) {
            // ignore error
          }

          reject(e);
        }

        if (oldHash !== hash) {
          await this.deleteBlobIfOrphaned(oldHash);
        }

        resolve();
      });

      stream.on('error', async (err) => {
        input.destroy(err);
        cryptoHash.destroy();
        await handle.close();

        await fsp.unlink(tempFilename);

        reject(err);
      });

      input.on('error', async (err) => {
        stream.destroy(err);
        cryptoHash.destroy();
        await handle.close();

        await fsp.unlink(tempFilename);

        reject(err);
      });
    });
  }

  async create(_user: User) {
    if (await this.exists()) {
      throw new ResourceExistsError('A resource already exists here.');
    }

    this.nymphResource.hash = EMPTY_HASH;
    this.nymphResource.size = 0;

    if (!(await this.nymphResource.$save())) {
      throw new InternalServerError("Couldn't save resource entity.");
    }
  }

  async delete(_user: User) {
    if (this.nymphResource.parent == null) {
      throw new ForbiddenError("This resource can't be deleted.");
    }

    if (!(await this.exists())) {
      throw new ResourceNotFoundError("This resource couldn't be found.");
    }

    if (
      await this.adapter.nymph.getEntity(
        { class: this.adapter.NymphResource, skipAc: true },
        {
          type: '&',
          ref: ['parent', this.nymphResource],
        },
      )
    ) {
      throw new ForbiddenError('This resource is not empty.');
    }

    if (await this.nymphResource.$delete()) {
      await this.deleteBlobIfOrphaned(this.nymphResource.hash);
    } else {
      throw new InternalServerError("Couldn't delete resource entity.");
    }
  }

  async copy(destination: URL, baseUrl: URL, user: User) {
    if (this.nymphResource.parent == null) {
      throw new ForbiddenError("This resource can't be copied.");
    }

    const destinationPathParts = this.adapter.urlToPathParts(
      destination,
      baseUrl,
    );
    if (destinationPathParts == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.',
      );
    }

    const destinationPath = `/${destinationPathParts.join('/')}`;

    if (
      this.path === destinationPath ||
      ((await this.isCollection()) &&
        destinationPath.startsWith(`${this.path}/`))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.',
      );
    }

    const destinationParent = await this.adapter.getNymphParent(
      destinationPathParts,
      this.rootResource,
    );

    if (!destinationParent) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.',
      );
    }

    let destinationNymphResource = await this.adapter.nymph.getEntity(
      {
        class: this.adapter.NymphResource,
        skipAc: true,
      },
      {
        type: '&',
        equal: ['name', destinationPathParts[destinationPathParts.length - 1]],
        ref: ['parent', destinationParent],
      },
    );

    // Check if the user can put it in the destination.
    if (user instanceof NymphUser) {
      const tilmeld = enforceTilmeld(this.adapter.nymph);

      if (destinationNymphResource) {
        if (
          !tilmeld.checkPermissions(
            destinationNymphResource,
            TilmeldAccessLevels.FULL_ACCESS,
            user,
          )
        ) {
          throw new UnauthorizedError(
            'You do not have permission to write to the destination.',
          );
        }
      } else {
        if (
          !tilmeld.checkPermissions(
            destinationParent,
            TilmeldAccessLevels.READ_ACCESS,
            user,
          )
        ) {
          throw new UnauthorizedError(
            'You do not have permission to access the destination.',
          );
        }

        if (
          !tilmeld.checkPermissions(
            destinationParent,
            TilmeldAccessLevels.WRITE_ACCESS,
            user,
          )
        ) {
          throw new UnauthorizedError(
            'You do not have permission to write to the destination.',
          );
        }
      }
    }

    await this.nymphResource.$copy(
      destinationParent,
      destinationPathParts[destinationPathParts.length - 1],
      destinationNymphResource ?? undefined,
    );

    if (destinationNymphResource != null) {
      await this.deleteBlobIfOrphaned(destinationNymphResource.hash);
    }
  }

  async move(destination: URL, baseUrl: URL, user: User) {
    if (this.nymphResource.parent == null) {
      throw new ForbiddenError("This resource can't be copied.");
    }

    const destinationPathParts = this.adapter.urlToPathParts(
      destination,
      baseUrl,
    );
    if (destinationPathParts == null) {
      throw new BadGatewayError(
        'The destination URL is not under the namespace of this server.',
      );
    }

    const destinationPath = `/${destinationPathParts.join('/')}`;

    if (
      this.path === destinationPath ||
      ((await this.isCollection()) &&
        destinationPath.startsWith(`${this.path}/`))
    ) {
      throw new ForbiddenError(
        'The destination cannot be the same as or contained within the source.',
      );
    }

    const destinationParent = await this.adapter.getNymphParent(
      destinationPathParts,
      this.rootResource,
    );

    if (!destinationParent) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.',
      );
    }

    let destinationNymphResource = await this.adapter.nymph.getEntity(
      {
        class: this.adapter.NymphResource,
        skipAc: true,
      },
      {
        type: '&',
        equal: ['name', destinationPathParts[destinationPathParts.length - 1]],
        ref: ['parent', destinationParent],
      },
    );

    // Check if the user can put it in the destination.
    if (user instanceof NymphUser) {
      const tilmeld = enforceTilmeld(this.adapter.nymph);

      if (destinationNymphResource) {
        if (
          !tilmeld.checkPermissions(
            destinationNymphResource,
            TilmeldAccessLevels.FULL_ACCESS,
            user,
          )
        ) {
          throw new UnauthorizedError(
            'You do not have permission to write to the destination.',
          );
        }
      } else {
        if (
          !tilmeld.checkPermissions(
            destinationParent,
            TilmeldAccessLevels.READ_ACCESS,
            user,
          )
        ) {
          throw new UnauthorizedError(
            'You do not have permission to access the destination.',
          );
        }

        if (
          !tilmeld.checkPermissions(
            destinationParent,
            TilmeldAccessLevels.WRITE_ACCESS,
            user,
          )
        ) {
          throw new UnauthorizedError(
            'You do not have permission to write to the destination.',
          );
        }
      }
    }

    await this.nymphResource.$move(
      destinationParent,
      destinationPathParts[destinationPathParts.length - 1],
      destinationNymphResource ?? undefined,
    );

    if (destinationNymphResource != null) {
      await this.deleteBlobIfOrphaned(destinationNymphResource.hash);
    }
  }

  async getLength() {
    return this.nymphResource.size;
  }

  async getEtag() {
    return (this.nymphResource?.hash ?? EMPTY_HASH).slice(0, 32);
  }

  async getMediaType() {
    if (await this.isCollection()) {
      return null;
    }

    return this.nymphResource.contentType;
  }

  async getCanonicalName() {
    return this.path.split('/').pop() ?? '';
  }

  async getCanonicalPath() {
    if (await this.isCollection()) {
      return `${this.path}/`;
    }
    return this.path;
  }

  async getCanonicalUrl() {
    let pathname = this.path
      .replace(/^\//, () => '')
      .split('/')
      .filter((part) => part !== '')
      .map(encodeURIComponent)
      .join('/');
    if (await this.isCollection()) {
      pathname = `${pathname}/`;
    }
    return new URL(pathname, this.baseUrl);
  }

  async isCollection() {
    return !!this.nymphResource.collection;
  }

  async getInternalMembers(_user: User) {
    if (!(await this.isCollection())) {
      throw new MethodNotSupportedError('This is not a collection.');
    }

    const resources: Resource[] = [];

    const nymphResources = await this.adapter.nymph.getEntities(
      { class: this.adapter.NymphResource },
      {
        type: '&',
        ref: ['parent', this.nymphResource],
      },
    );

    for (let nymphResource of nymphResources) {
      resources.push(
        new Resource({
          path: `${this.path}/${nymphResource.name}`,
          baseUrl: this.baseUrl,
          adapter: this.adapter,
          nymphResource,
          rootResource: this.rootResource,
        }),
      );
    }

    return resources;
  }

  async exists() {
    return this.nymphResource.guid != null;
  }

  async getFreeSpace() {
    return (await checkDiskSpace(this.adapter.root)).free;
  }

  async getTotalSpace() {
    return (await checkDiskSpace(this.adapter.root)).size;
  }
}
