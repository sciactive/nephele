import path from 'node:path';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import userid from 'userid';

import type { Request } from 'express';
import basicAuth from 'basic-auth';

import type {
  Adapter as AdapterInterface,
  AuthResponse as NepheleAuthResponse,
  Method,
} from '../index.js';
import {
  BadGatewayError,
  MethodNotImplementedError,
  MethodNotSupportedError,
  ResourceNotFoundError,
} from '../index.js';

import type Lock from './Lock.js';
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
import User from './User.js';
import Resource from './Resource.js';

const { username, groupname } = userid;

export type AuthResponse = NepheleAuthResponse<any, { user: User }>;

/**
 * This is an example filesystem adapter.
 *
 * IT IS FOR TESTING ONLY!!!
 *
 * I did not make any attempt to make this adapter secure enough to use in
 * production environments.
 *
 * DO NOT USE IT WITH ANY SENSITIVE OR IMPORTANT DATA!!
 *
 * Read the details on https://www.npmjs.com/package/authenticate-pam, which is
 * required for PAM authentication.
 */
export default class Adapter implements AdapterInterface {
  root: string;
  pam: boolean;

  /**
   * Root should be the absolute path of the directory that acts as the root
   * directory for the service.
   *
   * If pam is true, PAM authentication will be used. Otherwise, the server will
   * be completely open and any username/password will work.
   *
   * @param config Adapter config.
   */
  constructor({
    root = process.cwd(),
    pam = true,
  }: {
    root?: string;
    pam?: boolean;
  } = {}) {
    this.root = root;
    this.pam = pam;
  }

  urlToRelativePath(url: URL, baseUrl: string) {
    if (!url.pathname.startsWith(baseUrl)) {
      return null;
    }

    return path
      .join('/', decodeURI(url.pathname.substring(baseUrl.length)))
      .replace(/\/?$/, '');
  }

  urlToAbsolutePath(url: URL, baseUrl: string) {
    const relativePath = this.urlToRelativePath(url, baseUrl);

    if (relativePath == null) {
      return null;
    }

    return path.join(this.root, relativePath);
  }

  async getUsername(uid: number): Promise<string> {
    if (!this.pam) {
      return 'nobody';
    }

    return username(uid);
  }

  async getGroupname(gid: number): Promise<string> {
    if (!this.pam) {
      return 'nobody';
    }

    return groupname(gid);
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

  async authenticate(request: Request, _response: AuthResponse) {
    const authorization = request.get('Authorization');
    let username = 'nobody';
    let password = '';

    if (authorization) {
      const auth = basicAuth.parse(authorization);
      if (auth) {
        username = auth.name;
        password = auth.pass;
      }
    }
    const user = new User({ username, adapter: this });
    await user.authenticate(password);

    return user;
  }

  async cleanAuthentication(_request: Request, _response: AuthResponse) {
    // Nothing is required for auth cleanup.
    return;
  }

  async isAuthorized(url: URL, method: string, baseUrl: string, user: User) {
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
    const uid = await user.getUid();
    const gids = await user.getGids();

    // First make sure the server process and user has access to all
    // directories in the tree.
    const pathname = this.urlToRelativePath(url, baseUrl);
    if (pathname == null) {
      return false;
    }
    const parts = [
      this.root,
      ...pathname.split(path.sep).filter((str) => str !== ''),
    ];
    let exists = true;

    try {
      await fsp.access(
        pathname,
        access === 'w' ? constants.W_OK : constants.R_OK
      );
    } catch (e: any) {
      exists = false;
    }

    if (this.pam) {
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
    // directories above it. (Or pam is disabled.)
    return true;
  }

  async getResource(url: URL, baseUrl: string) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    const resource = new Resource({
      path,
      adapter: this,
    });

    if (!(await resource.exists())) {
      throw new ResourceNotFoundError('Resource not found.');
    }

    return resource;
  }

  async newResource(url: URL, baseUrl: string) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    return new Resource({
      path,
      adapter: this,
    });
  }

  async newCollection(url: URL, baseUrl: string) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    return new Resource({
      path,
      adapter: this,
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
