import path from 'node:path';
import fs from 'node:fs';
import { constants } from 'node:fs';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Nymph, TilmeldAccessLevels } from '@nymphjs/nymph';
import { SQLite3Driver } from '@nymphjs/driver-sqlite3';
import { Tilmeld, User as NymphUser, enforceTilmeld } from '@nymphjs/tilmeld';
import type {
  Adapter as AdapterInterface,
  AuthResponse,
  Method,
  User,
} from 'nephele';
import {
  BadGatewayError,
  InternalServerError,
  MethodNotImplementedError,
  MethodNotSupportedError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
} from 'nephele';

import { Lock as NymphLock } from './entities/Lock.js';
import {
  Resource as NymphResource,
  ResourceData as NymphResourceData,
} from './entities/Resource.js';

import Resource from './Resource.js';
import { EMPTY_HASH } from './constants.js';

export type AdapterConfig = {
  /**
   * The absolute path of the directory that acts as the root directory for the
   * service.
   */
  root: string;
  /**
   * The instance of Nymph that will manage the data.
   *
   * If you do not provide one, a Nymph instance will be created that uses a
   * SQLite3 database in the file root called "nephele.db".
   */
  nymph?: Nymph;
  /**
   * A function to get the root resource of the namespace.
   *
   * The default implementation will look for a collection Resource without a
   * parent. If one isn't found, one will be created with a UUIDv4 as a name.
   *
   * This does pose an issue if the user has read access to multiple root
   * resources. The first one found will be used. If this is not acceptible, you
   * must provide your own implementation.
   */
  getRootResource?: () => Promise<NymphResource & NymphResourceData>;
};

/**
 * Nephele file system adapter.
 */
export default class Adapter implements AdapterInterface {
  root: string;
  nymph: Nymph;
  getRootResource: () => Promise<NymphResource & NymphResourceData>;
  NymphLock: typeof NymphLock;
  NymphResource: typeof NymphResource;

  get tempRoot() {
    return path.resolve(this.root, 'temp');
  }

  get blobRoot() {
    return path.resolve(this.root, 'blob');
  }

  constructor({ nymph, root, getRootResource }: AdapterConfig) {
    this.root = root.replace(
      new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
      () => path.sep
    );
    this.nymph =
      nymph ||
      new Nymph(
        {},
        new SQLite3Driver({
          filename: path.resolve(this.root, 'nephele.db'),
          wal: true,
        })
      );

    try {
      this.NymphLock = this.nymph.getEntityClass(NymphLock);
    } catch (e: any) {
      this.NymphLock = this.nymph.addEntityClass(NymphLock);
    }
    try {
      this.NymphResource = this.nymph.getEntityClass(NymphResource);
    } catch (e: any) {
      this.NymphResource = this.nymph.addEntityClass(NymphResource);
    }

    this.getRootResource =
      getRootResource ??
      (async () => {
        let rootResource = await this.nymph.getEntity(
          { class: this.NymphResource },
          {
            type: '&',
            '!defined': 'parent',
            equal: ['collection', true],
          }
        );

        if (rootResource == null) {
          rootResource = await this.NymphResource.factory();
          rootResource.name = uuidv4();
          rootResource.size = 0;
          rootResource.contentType = 'inode/directory';
          rootResource.collection = true;
          rootResource.hash = EMPTY_HASH;

          if (!(await rootResource.$save())) {
            throw new InternalServerError(
              'Root resource could not be created.'
            );
          }
        }

        return rootResource;
      });
    try {
      fs.accessSync(this.root, constants.R_OK);
    } catch (e: any) {
      throw new Error(
        "Can't read from given file system root. Does the directory exist?"
      );
    }
  }

  urlToPathParts(url: URL, baseUrl: URL) {
    if (
      !decodeURIComponent(url.pathname)
        .replace(/\/?$/, () => '/')
        .startsWith(decodeURIComponent(baseUrl.pathname))
    ) {
      return null;
    }

    return decodeURIComponent(url.pathname)
      .substring(decodeURIComponent(baseUrl.pathname).length)
      .replace(/\/?$/, '')
      .split('/')
      .filter((str) => str !== '');
  }

  pathPartsToUrl(pathParts: string[], baseUrl: URL) {
    return new URL(pathParts.map(encodeURIComponent).join('/'), baseUrl);
  }

  async getComplianceClasses(
    _url: URL,
    _request: Request,
    _response: AuthResponse
  ) {
    // This adapter supports locks.
    return ['2'];
  }

  async getAllowedMethods(
    _url: URL,
    _request: Request,
    _response: AuthResponse
  ) {
    // This adapter doesn't support any WebDAV extensions that require
    // additional methods.
    return [];
  }

  async getOptionsResponseCacheControl(
    _url: URL,
    _request: Request,
    _response: AuthResponse
  ) {
    // This adapter doesn't do anything special for individual URLs, so a max
    // age of one week is fine.
    return 'max-age=604800';
  }

  async isAuthorized(url: URL, method: string, baseUrl: URL, user: User) {
    let tilmeld: Tilmeld;
    try {
      tilmeld = enforceTilmeld(this.nymph);
    } catch (e: any) {
      // If we don't have Tilmeld, then everything is authorized.
      return true;
    }

    if (!(user instanceof NymphUser)) {
      return false;
    }

    // What type of file access do we need?
    let access = TilmeldAccessLevels.NO_ACCESS;

    if (['GET', 'HEAD', 'COPY', 'OPTIONS', 'PROPFIND'].includes(method)) {
      // Read operations.
      access = TilmeldAccessLevels.READ_ACCESS;
    }

    if (['POST', 'PUT', 'MKCOL', 'PROPPATCH'].includes(method)) {
      // Write operations.
      access = TilmeldAccessLevels.WRITE_ACCESS;
    }

    if (['DELETE', 'MOVE'].includes(method)) {
      // Move/delete operations.
      access = TilmeldAccessLevels.FULL_ACCESS;
    }

    if (['SEARCH'].includes(method)) {
      // Execute operations. (Directory listing.)
      access = TilmeldAccessLevels.READ_ACCESS;
    }

    if (['LOCK', 'UNLOCK'].includes(method)) {
      // Require the user to have write permission to lock and unlock a
      // resource.
      access = TilmeldAccessLevels.WRITE_ACCESS;
    }

    if (access === TilmeldAccessLevels.NO_ACCESS) {
      return false;
    }

    // First make sure the server process and user has access to all
    // directories in the tree.
    const pathParts = this.urlToPathParts(url, baseUrl);
    if (pathParts == null) {
      return false;
    }

    let curParent: NymphResource & NymphResourceData =
      await this.getRootResource();
    for (let i = 0; i < pathParts.length; i++) {
      const curResource: (NymphResource & NymphResourceData) | null =
        await this.nymph.getEntity(
          { class: this.NymphResource },
          {
            type: '&',
            equal: ['name', pathParts[i]],
            ref: ['parent', curParent],
          }
        );

      if (curResource == null) {
        if (i < pathParts.length - 1) {
          // This is before the last path part, so the resource tree is not
          // complete.
          return false;
        }

        // This is the last path part, and the resource doesn't exist, so check
        // if we have write permission to the parent.
        return (
          curParent == null ||
          tilmeld.checkPermissions(
            curParent,
            TilmeldAccessLevels.WRITE_ACCESS,
            user
          )
        );
      } else if (i === pathParts.length - 1) {
        // This is the last path part, so this is the resource we need to check.
        return tilmeld.checkPermissions(
          curResource,
          TilmeldAccessLevels.WRITE_ACCESS,
          user
        );
      } else if (curResource.collection !== true) {
        // One of the resources in the resource tree is not a collection.
        return false;
      } else {
        // Keep going down the resource tree.
        curParent = curResource;
      }
    }

    // We shouldn't ever get here, but just in case, return false.
    return false;
  }

  async getParent(pathParts: string[]) {
    let curParent: NymphResource & NymphResourceData =
      await this.getRootResource();

    if (pathParts.length <= 1) {
      return curParent;
    }

    for (let i = 0; i < pathParts.length; i++) {
      if (i === pathParts.length - 1) {
        // This is the last path part.
        return curParent;
      }

      const curResource: (NymphResource & NymphResourceData) | null =
        await this.nymph.getEntity(
          { class: this.NymphResource },
          {
            type: '&',
            equal: [
              ['name', pathParts[i]],
              ['collection', true],
            ],
            ref: ['parent', curParent],
          }
        );

      if (curResource == null) {
        // This is before the last path part, so the resource tree is not
        // complete.
        return false;
      }

      // Keep going down the resource tree.
      curParent = curResource;
    }

    // We shouldn't ever get here, but just in case.
    return curParent;
  }

  async getResource(url: URL, baseUrl: URL) {
    const pathParts = this.urlToPathParts(url, baseUrl);

    if (pathParts == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    if (pathParts.length === 0) {
      return new Resource({
        adapter: this,
        baseUrl,
        path: '/',
        nymphResource: await this.getRootResource(),
      });
    }

    const parent = await this.getParent(pathParts);

    if (parent === false) {
      throw new ResourceNotFoundError('Resource not found.');
    }

    const nymphResource = await this.nymph.getEntity(
      { class: this.NymphResource },
      {
        type: '&',
        equal: ['name', pathParts[pathParts.length - 1]],
        ref: ['parent', parent],
      }
    );

    if (nymphResource == null) {
      throw new ResourceNotFoundError('Resource not found.');
    }

    const resource = new Resource({
      adapter: this,
      baseUrl,
      path: `/${pathParts.join('/')}`,
      nymphResource,
    });

    return resource;
  }

  async newResource(url: URL, baseUrl: URL) {
    const pathParts = this.urlToPathParts(url, baseUrl);

    if (pathParts == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    if (pathParts.length === 0) {
      return new Resource({
        adapter: this,
        baseUrl,
        path: '/',
        nymphResource: await this.getRootResource(),
      });
    }

    const parent = await this.getParent(pathParts);

    if (!parent) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    const nymphResource = await this.nymph.getEntity(
      { class: this.NymphResource },
      {
        type: '&',
        equal: ['name', pathParts[pathParts.length - 1]],
        ref: ['parent', parent],
      }
    );

    if (nymphResource == null) {
      const newResource = await this.NymphResource.factory();

      newResource.name = pathParts[pathParts.length - 1];
      newResource.hash = EMPTY_HASH;
      newResource.size = 0;
      newResource.contentType = 'application/octet-stream';
      newResource.collection = false;
      newResource.parent = parent;

      return new Resource({
        adapter: this,
        baseUrl,
        path: `/${pathParts.join('/')}`,
        nymphResource: newResource,
      });
    }

    return new Resource({
      adapter: this,
      baseUrl,
      path: `/${pathParts.join('/')}`,
      nymphResource,
    });
  }

  async newCollection(url: URL, baseUrl: URL) {
    const pathParts = this.urlToPathParts(url, baseUrl);

    if (pathParts == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    if (pathParts.length === 0) {
      return new Resource({
        adapter: this,
        baseUrl,
        path: '/',
        nymphResource: await this.getRootResource(),
      });
    }

    const parent = await this.getParent(pathParts);

    if (!parent) {
      throw new ResourceTreeNotCompleteError(
        'One or more intermediate collections must be created before this resource.'
      );
    }

    const nymphResource = await this.nymph.getEntity(
      { class: this.NymphResource },
      {
        type: '&',
        equal: ['name', pathParts[pathParts.length - 1]],
        ref: ['parent', parent],
      }
    );

    if (nymphResource == null) {
      const newResource = await this.NymphResource.factory();

      newResource.name = pathParts[pathParts.length - 1];
      newResource.hash = EMPTY_HASH;
      newResource.size = 0;
      newResource.contentType = 'inode/directory';
      newResource.collection = true;
      newResource.parent = parent;

      return new Resource({
        adapter: this,
        baseUrl,
        path: `/${pathParts.join('/')}`,
        nymphResource: newResource,
      });
    }

    return new Resource({
      adapter: this,
      baseUrl,
      path: `/${pathParts.join('/')}`,
      nymphResource,
    });
  }

  getMethod(method: string): typeof Method {
    // No additional methods to handle.
    if (method === 'POST' || method === 'PATCH') {
      throw new MethodNotSupportedError('Method not supported.');
    }
    throw new MethodNotImplementedError('Method not implemented.');
  }
}
