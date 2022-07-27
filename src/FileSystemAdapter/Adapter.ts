import path from 'node:path';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Request } from 'express';
import basicAuth from 'basic-auth';

import type {
  Adapter as AdapterInterface,
  AuthResponse as NepheleAuthResponse,
  Method,
} from '../index.js';
import { MethodNotSupportedError, ResourceNotFoundError } from '../index.js';
import User from './User.js';
import Resource from './Resource.js';

export type AuthResponse = NepheleAuthResponse<any, { user: User }>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Unix filesystem permission bits.
const userRead = 0o400;
const userWrite = 0o200;
const userExecute = 0o100;
const groupRead = 0o40;
const groupWrite = 0o20;
const groupExecute = 0o10;
const otherRead = 0o4;
const otherWrite = 0o2;
const otherExecute = 0o1;

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
  scheme: string;
  host: string;
  port: number;
  path: string;
  root: string;
  pam: boolean;

  /**
   * The parts of the canonical URL of this service should be passed as config.
   *
   * Scheme should include only the name of the scheme, not the '://' part.
   *
   * Host should be a URL safe hostname.
   *
   * Port should be the port the service is running on, even if its the default
   * port.
   *
   * Path should be the full path of this service on the server, including both
   * a leading and trailing forward slash. It should **not** be URI encoded. If
   * this service is the root service on this server, the path should be "/". It
   * is needed to build canonical URLs.
   *
   * Root should be the absolute path of the directory that acts as the root
   * directory for the service.
   *
   * If pam is true, PAM authentication will be used. Otherwise, the server will
   * be completely open and any username/password will work.
   *
   * @param config Adapter config.
   */
  constructor({
    scheme = 'http',
    host = 'localhost',
    port = 8080,
    path = '/',
    root = __dirname,
    pam = true,
  }: {
    scheme: string;
    host: string;
    port: number;
    path: string;
    root: string;
    pam: boolean;
  }) {
    this.scheme = scheme;
    this.host = host;
    this.port = port;
    this.path = path;
    this.root = root;
    this.pam = pam;

    if (!this.path.startsWith('/')) {
      throw new Error('The path must begin with a forward slash.');
    }

    if (!this.path.endsWith('/')) {
      throw new Error('The path must end with a forward slash.');
    }
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

  async authenticate(request: Request, response: AuthResponse) {
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

  async isAuthorized(
    _url: URL,
    method: string,
    request: Request,
    response: AuthResponse
  ) {
    // What type of file access do we need?
    let access = 'u';

    if (['GET', 'HEAD', 'COPY', 'OPTIONS', 'PROPFIND'].indexOf(method) > -1) {
      // Read operations.
      access = 'r';
    }

    if (
      ['POST', 'PUT', 'PATCH', 'DELETE', 'MOVE', 'MKCOL', 'PROPPATCH'].indexOf(
        method
      ) > -1
    ) {
      // Write operations.
      access = 'w';
    }

    if (['SEARCH'].indexOf(method) > -1) {
      // Execute operations. (Directory listing.)
      access = 'x';
    }

    if (['LOCK', 'UNLOCK'].indexOf(method) > -1) {
      // TODO: What should this be?
      access = 'r';
    }

    if (access === 'u') {
      return false;
    }

    // We need the user and group IDs.
    const uid = await (response.locals.user as User).getUid();
    const gids = await (response.locals.user as User).getGids();

    // First make sure the server process and user has access to all
    // directories in the tree.
    const pathname = path.join(this.root, request.path);
    const parts = pathname.split(path.sep).filter((str) => str !== '');
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
                stats.mode & otherExecute ||
                (stats.uid === uid && stats.mode & userExecute) ||
                (gids.indexOf(stats.gid) > -1 && stats.mode & groupExecute)
              )
            ) {
              return false;
            }
          }

          if (i === parts.length && access === 'r' && exists) {
            if (
              !(
                stats.mode & otherRead ||
                (stats.uid === uid && stats.mode & userRead) ||
                (gids.indexOf(stats.gid) > -1 && stats.mode & groupRead)
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
                stats.mode & otherWrite ||
                (stats.uid === uid && stats.mode & userWrite) ||
                (gids.indexOf(stats.gid) > -1 && stats.mode & groupWrite)
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

  async getResource(_url: URL, request: Request, _response: AuthResponse) {
    const resource = new Resource({
      path: request.path,
      adapter: this,
    });

    if (!(await resource.exists())) {
      throw new ResourceNotFoundError('Resource not found.');
    }

    return resource;
  }

  async newResource(_url: URL, request: Request, _response: AuthResponse) {
    return new Resource({
      path: request.path,
      adapter: this,
    });
  }

  async newCollection(_url: URL, request: Request, _response: AuthResponse) {
    return new Resource({
      path: request.path,
      adapter: this,
      collection: true,
    });
  }

  getMethod(_method: string): typeof Method {
    // No additional methods to handle.
    throw new MethodNotSupportedError('Method not allowed.');
  }
}
