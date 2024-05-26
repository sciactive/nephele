import path from 'node:path';
import fs from 'node:fs';
import { constants } from 'node:fs';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  Nymph,
  type Options,
  type Selector,
  TilmeldAccessLevels,
} from '@nymphjs/nymph';
import { SQLite3Driver } from '@nymphjs/driver-sqlite3';
import {
  Tilmeld,
  User as NymphUser,
  enforceTilmeld,
  AccessControlError,
} from '@nymphjs/tilmeld';
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
  _rootResource: (NymphResource & NymphResourceData) | null = null;

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
    const driver = new SQLite3Driver({
      filename: path.resolve(this.root, 'nephele.db'),
      wal: true,
    });
    this.nymph = nymph || new Nymph({}, driver);

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
        if (this._rootResource == null) {
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

          this._rootResource = rootResource;
        }

        return this._rootResource;
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
      // Not managed by this adapter.
      return false;
    }

    if (pathParts.length === 0) {
      // The user only has access to change their root, not delete or move it.
      return access <= TilmeldAccessLevels.WRITE_ACCESS;
    }

    try {
      let rootResource: NymphResource & NymphResourceData =
        await this.getRootResource();

      const parent = await this.getNymphParent(pathParts, rootResource);

      if (!parent || parent.collection !== true) {
        // The resource tree is not complete.
        return false;
      }

      const curResource: (NymphResource & NymphResourceData) | null =
        await this.nymph.getEntity(
          { class: this.NymphResource },
          {
            type: '&',
            equal: ['name', pathParts[pathParts.length - 1]],
            ref: ['parent', parent],
          }
        );

      if (curResource == null) {
        // Check the parent for at least write permission.
        return tilmeld.checkPermissions(
          parent,
          Math.max(access, TilmeldAccessLevels.WRITE_ACCESS),
          user
        );
      } else {
        // Check the resoure itself.
        return tilmeld.checkPermissions(curResource, access, user);
      }
    } catch (e: any) {
      if (e instanceof AccessControlError) {
        return false;
      }

      throw e;
    }

    // We shouldn't ever get here, but just in case, return false.
    return false;
  }

  async getNymphResource(
    pathParts: string[],
    rootResource: NymphResource & NymphResourceData
  ) {
    if (pathParts.length === 0) {
      return rootResource;
    }

    let query = [
      { class: this.NymphResource },
      {
        type: '&',
        guid: rootResource.guid,
      },
    ] as [Options<typeof NymphResource>, ...Selector[]];

    let depth = 0;
    for (let i = 0; i < pathParts.length; i++) {
      if (depth === 2) {
        const resource = await this.nymph.getEntity(...query);
        if (resource == null) {
          return resource;
        }
        query = [
          { class: this.NymphResource },
          {
            type: '&',
            guid: resource.guid,
          },
        ] as [Options<typeof NymphResource>, ...Selector[]];
        depth = 0;
      }

      const part = pathParts[i];
      query = [
        { class: this.NymphResource },
        {
          type: '&',
          equal: [
            ['name', part],
            ...(i < pathParts.length - 1 ? [['collection', true]] : []),
          ],
          qref: ['parent', query],
        },
      ] as [Options<typeof NymphResource>, ...Selector[]];

      depth++;
    }

    return await this.nymph.getEntity(...query);
  }

  async getNymphParent(
    pathParts: string[],
    rootResource: NymphResource & NymphResourceData
  ) {
    if (pathParts.length <= 1) {
      return rootResource;
    }

    const resource = await this.getNymphResource(
      pathParts.slice(0, -1),
      rootResource
    );

    if (resource == null || resource.collection !== true) {
      return false;
    }

    return resource;
  }

  async getResource(url: URL, baseUrl: URL) {
    const pathParts = this.urlToPathParts(url, baseUrl);

    if (pathParts == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    try {
      const rootResource = await this.getRootResource();

      if (pathParts.length === 0) {
        return new Resource({
          adapter: this,
          baseUrl,
          path: '/',
          nymphResource: rootResource,
          rootResource,
        });
      }

      const nymphResource = await this.getNymphResource(
        pathParts,
        rootResource
      );

      if (nymphResource == null) {
        throw new ResourceNotFoundError('Resource not found.');
      }

      const resource = new Resource({
        adapter: this,
        baseUrl,
        path: `/${pathParts.join('/')}`,
        nymphResource,
        rootResource,
      });

      return resource;
    } catch (e: any) {
      if (e instanceof AccessControlError) {
        throw new ResourceNotFoundError('Resource not found.');
      }
      throw e;
    }
  }

  async newResource(url: URL, baseUrl: URL) {
    const pathParts = this.urlToPathParts(url, baseUrl);

    if (pathParts == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    const rootResource = await this.getRootResource();

    if (pathParts.length === 0) {
      return new Resource({
        adapter: this,
        baseUrl,
        path: '/',
        nymphResource: rootResource,
        rootResource,
      });
    }

    const parent = await this.getNymphParent(pathParts, rootResource);

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
        rootResource,
      });
    }

    return new Resource({
      adapter: this,
      baseUrl,
      path: `/${pathParts.join('/')}`,
      nymphResource,
      rootResource,
    });
  }

  async newCollection(url: URL, baseUrl: URL) {
    const pathParts = this.urlToPathParts(url, baseUrl);

    if (pathParts == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    const rootResource = await this.getRootResource();

    if (pathParts.length === 0) {
      return new Resource({
        adapter: this,
        baseUrl,
        path: '/',
        nymphResource: rootResource,
        rootResource,
      });
    }

    const parent = await this.getNymphParent(pathParts, rootResource);

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
        rootResource,
      });
    }

    return new Resource({
      adapter: this,
      baseUrl,
      path: `/${pathParts.join('/')}`,
      nymphResource,
      rootResource,
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
