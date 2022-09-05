import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import userid from 'userid';
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

const { username, groupname, uid, ids, gids } = userid;

export type AdapterConfig = {
  /**
   * The absolute path of the directory that acts as the root directory for the
   * service.
   */
  root: string;
  /**
   * Whether the usernames provided by the authenticator map directly to system
   * usernames.
   *
   * If this is set to true, and they don't, you **will** see errors. The
   * adapter will attempt to `chown` files to the user who is currently
   * authenticated.
   */
  usernamesMapToSystemUsers: boolean;
  /**
   * The maximum filesize in megabytes to calculate etags by a CRC-32C checksum
   * of the file contents. Anything above this file size will use a CRC-32C
   * checksum of the size, created time, and modified time instead. This will
   * significantly speed up responses to requests for these files, but at the
   * cost of reduced accuracy of etags. A file that has the exact same content,
   * but a different modified time will not be pulled from cache by the client.
   *
   * - Set this value to `Infinity` if you wish to fully follow the WebDAV spec
   *   to the letter.
   * - Set this value to `-1` if you want to absolutely minimize disk IO.
   * - `100` is a good value for fast disks, like SSDs. If you are serving files
   *   from spinning hard disks or optical media, you should consider lowering
   *   this threshold.
   */
  contentEtagMaxMB?: number;
};

/**
 * Nephele file system adapter.
 */
export default class Adapter implements AdapterInterface {
  root: string;
  contentEtagMaxMB: number;
  usernamesMapToSystemUsers: boolean;

  constructor({
    root,
    usernamesMapToSystemUsers,
    contentEtagMaxMB = 100,
  }: AdapterConfig) {
    this.root = root.replace(/\/?$/, () => '/');
    this.usernamesMapToSystemUsers = usernamesMapToSystemUsers;
    this.contentEtagMaxMB = contentEtagMaxMB;

    try {
      fs.accessSync(this.root, constants.R_OK);
    } catch (e: any) {
      throw new Error(
        "Can't read from given file system root. Does the directory exist?"
      );
    }
  }

  urlToRelativePath(url: URL, baseUrl: URL) {
    if (!url.pathname.replace(/\/?$/, () => '/').startsWith(baseUrl.pathname)) {
      return null;
    }

    return path.join(
      '/',
      decodeURIComponent(
        url.pathname.substring(baseUrl.pathname.length)
      ).replace(/\/?$/, '')
    );
  }

  urlToAbsolutePath(url: URL, baseUrl: URL) {
    const relativePath = this.urlToRelativePath(url, baseUrl);

    if (relativePath == null) {
      return null;
    }

    return path.join(this.root, relativePath);
  }

  async getUsername(uid: number): Promise<string> {
    return username(uid);
  }

  async getGroupname(gid: number): Promise<string> {
    return groupname(gid);
  }

  async getUid(user: User): Promise<number> {
    if (!this.usernamesMapToSystemUsers) {
      return -1;
    }

    return uid(user.username);
  }

  async getGid(user: User): Promise<number> {
    if (!this.usernamesMapToSystemUsers) {
      return -1;
    }

    return ids(user.username).gid;
  }

  async getGids(user: User): Promise<number[]> {
    if (!this.usernamesMapToSystemUsers) {
      return [];
    }

    return gids(user.username);
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

    if (this.usernamesMapToSystemUsers) {
      for (let i = 1; i <= parts.length; i++) {
        const ipathname = path.join('/', ...parts.slice(0, i));

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
          if (exists || i < parts.length) {
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
