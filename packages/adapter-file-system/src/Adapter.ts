import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import type { Request } from 'express';
import type {
  Adapter as AdapterInterface,
  AuthResponse,
  Method,
  User,
} from 'nephele';
import {
  BadGatewayError,
  MethodNotImplementedError,
  MethodNotSupportedError,
  ResourceNotFoundError,
} from 'nephele';

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
import Resource from './Resource.js';

export type AdapterConfig = {
  /**
   * The absolute path of the directory that acts as the root directory for the
   * service.
   */
  root: string;
  /**
   * The maximum filesize in bytes to calculate etags by a CRC-32C checksum of
   * the file contents.
   *
   * Any files above this file size will use an etag of a CRC-32C checksum of
   * the size, created time, and modified time. This will significantly speed up
   * responses to requests for these files, but at the cost of reduced accuracy
   * of etags. A file that has the exact same content, but a different modified
   * time will not be pulled from cache by the client.
   *
   * - Set this value to `Infinity` if you wish to fully follow the WebDAV spec
   *   to the letter.
   * - Set this value to `-1` if you want to absolutely minimize disk IO.
   *
   * By default, all etags will be based on file size, created date, and
   * modified date, since this only requires retrieving metadata from the file
   * system, which is very fast compared to actually retrieving file contents.
   * This could technically go against the WebDAV spec section 8.8, which reads,
   * 'For any given URL, an "ETag" value MUST NOT be reused for different
   * representations returned by GET.' A file the exact same size and exact same
   * created and modified dates with different contents, though extremely
   * unlikely, would return the same etag.
   */
  contentEtagMaxBytes?: number;
};

/**
 * Nephele file system adapter.
 */
export default class Adapter implements AdapterInterface {
  root: string;
  contentEtagMaxBytes: number;

  constructor({ root, contentEtagMaxBytes = -1 }: AdapterConfig) {
    this.root = root.replace(
      new RegExp(`${path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?$`),
      () => path.sep
    );
    this.contentEtagMaxBytes = contentEtagMaxBytes;

    try {
      fs.accessSync(this.root, constants.R_OK);
    } catch (e: any) {
      throw new Error(
        "Can't read from given file system root. Does the directory exist?"
      );
    }
  }

  urlToRelativePath(url: URL, baseUrl: URL) {
    if (
      !decodeURIComponent(url.pathname)
        .replace(/\/?$/, () => '/')
        .startsWith(decodeURIComponent(baseUrl.pathname))
    ) {
      return null;
    }

    return path.join(
      path.sep,
      ...decodeURIComponent(url.pathname)
        .substring(decodeURIComponent(baseUrl.pathname).length)
        .replace(/\/?$/, '')
        .split('/')
    );
  }

  urlToAbsolutePath(url: URL, baseUrl: URL) {
    const relativePath = this.urlToRelativePath(url, baseUrl);

    if (relativePath == null) {
      return null;
    }

    return path.join(this.root, relativePath);
  }

  async getUid(user: User): Promise<number> {
    return user.uid == null ? -1 : user.uid;
  }

  async getGid(user: User): Promise<number> {
    return user.gid == null ? -1 : user.gid;
  }

  async getGids(user: User): Promise<number[]> {
    return user.gids == null ? [] : user.gids;
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
    // What type of file access do we need?
    let access = 'u';

    if (['GET', 'HEAD', 'COPY', 'OPTIONS', 'PROPFIND'].includes(method)) {
      // Read operations.
      access = 'r';
    }

    if (
      ['POST', 'PUT', 'DELETE', 'MOVE', 'MKCOL', 'PROPPATCH'].includes(method)
    ) {
      // Write operations.
      access = 'w';
    }

    if (['SEARCH'].includes(method)) {
      // Execute operations. (Directory listing.)
      access = 'x';
    }

    if (['LOCK', 'UNLOCK'].includes(method)) {
      // Require the user to have write permission to lock and unlock a
      // resource.
      access = 'w';
    }

    if (access === 'u') {
      return false;
    }

    // We need the user and group IDs.
    const uid = await this.getUid(user);
    const gids = await this.getGids(user);

    // First make sure the server process and user has access to all
    // directories in the tree.
    const pathname = this.urlToRelativePath(url, baseUrl);
    const absolutePathname = this.urlToAbsolutePath(url, baseUrl);
    if (pathname == null || absolutePathname == null) {
      return false;
    }
    const parts = [
      this.root,
      ...pathname.split(path.sep).filter((str) => str !== ''),
    ];
    let exists = true;

    try {
      await fsp.access(
        absolutePathname,
        access === 'w' ? constants.W_OK : constants.R_OK
      );
    } catch (e: any) {
      exists = false;
    }

    if (uid >= 0) {
      for (let i = 1; i <= parts.length; i++) {
        const ipathname = path.join(path.sep, ...parts.slice(0, i));

        // Check if the user can access it.
        try {
          const stats = await fsp.stat(ipathname);

          if (access === 'x' || i < parts.length) {
            if (
              !(
                stats.mode & otherExecuteBit ||
                (stats.uid === uid && stats.mode & userExecuteBit) ||
                (gids.includes(stats.gid) && stats.mode & groupExecuteBit)
              )
            ) {
              return false;
            }
          }

          if (i === parts.length && access === 'r' && exists) {
            if (
              !(
                stats.mode & otherReadBit ||
                (stats.uid === uid && stats.mode & userReadBit) ||
                (gids.includes(stats.gid) && stats.mode & groupReadBit)
              )
            ) {
              return false;
            }
          }

          if (
            (i === parts.length && access === 'w') ||
            (!exists && i === parts.length - 1)
          ) {
            if (
              !(
                stats.mode & otherWriteBit ||
                (stats.uid === uid && stats.mode & userWriteBit) ||
                (gids.includes(stats.gid) && stats.mode & groupWriteBit)
              )
            ) {
              return false;
            }
          }
        } catch (e: any) {
          if (exists || (i < parts.length && e.code !== 'ENOENT')) {
            return false;
          }
        }
      }
    }

    // If we get to here, it means either the file exists and user has
    // permission, or the file doesn't exist, and the user has access to all
    // directories above it.
    return true;
  }

  async getResource(url: URL, baseUrl: URL) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    const resource = new Resource({
      adapter: this,
      baseUrl,
      path,
    });

    if (!(await resource.exists())) {
      throw new ResourceNotFoundError('Resource not found.');
    }

    return resource;
  }

  async newResource(url: URL, baseUrl: URL) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    return new Resource({
      adapter: this,
      baseUrl,
      path,
    });
  }

  async newCollection(url: URL, baseUrl: URL) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    return new Resource({
      adapter: this,
      baseUrl,
      path,
      collection: true,
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
