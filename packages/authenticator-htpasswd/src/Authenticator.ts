import type { Readable } from 'node:stream';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { constants } from 'node:fs';
import type { Request } from 'express';
import basicAuth from 'basic-auth';
import apacheMD5 from 'apache-md5';
import crypt from 'apache-crypt';
import bcrypt from 'bcrypt';
import type {
  Authenticator as AuthenticatorInterface,
  AuthResponse as NepheleAuthResponse,
  Resource,
} from 'nephele';
import {
  ForbiddenError,
  InternalServerError,
  UnauthorizedError,
  ResourceNotFoundError,
} from 'nephele';

import User from './User.js';

export type AuthenticatorConfig = {
  /**
   * The realm is the name reported by the server when the user is prompted to
   * authenticate.
   *
   * It should be HTTP header safe (shouldn't include double quotes or
   * semicolon).
   */
  realm?: string;
  /**
   * Allow the user to proceed, even if they are not authenticated.
   *
   * The authenticator will advertise that authentication is available, but the
   * user will have access to the server without providing authentication.
   *
   * In the unauthorized state, the `user` presented to the Nephele adapter will
   * have the username "nobody".
   *
   * WARNING: It is very dangerous to allow unauthorized access if write actions
   * are allowed!
   */
  unauthorizedAccess?: boolean;
  /**
   * htpasswd filename.
   *
   * This file must be accessible to the adapter that is mounted when the user
   * has not yet been authenticated.
   *
   * For every request, the root directory is searched for this file, then each
   * directory in turn down to the directory of the request. Whichever file is
   * found first is what will be used. (Eg, if /dir/ contains a file with only
   * username "bob", and /dir/sub/ contains a file with username "jane", user
   * "jane" not be able to access either directory, and user "bob" will be able
   * to access both.)
   */
  authUserFilename?: string;
  /**
   * A specific htpasswd file to use for every request.
   *
   * If this filename is given, it points to the htpasswd file used to
   * authenticate every request.
   */
  authUserFile?: string;
  /**
   * Block access to the htpasswd file(s) that match `authUserFilename`.
   *
   * This is important, because a user with access to the file could add any
   * other users they wanted to the file. If you have some setup that guarantees
   * the htpasswd file used is not accessible to the adapter managing files, you
   * don't need this.
   *
   * This is not the only risk with htpasswd files! If a user has the ability to
   * move or delete a directory, and the directory contains the htpasswd file,
   * they could do nefarious things. You should consider the implications of
   * giving a user access to manage the directory that their htpasswd file is
   * stored in.
   *
   * If you are using `authUserFile`, this option is ignored.
   */
  blockAuthUserFilename?: boolean;
};

export type AuthResponse = NepheleAuthResponse<any, { user: User }>;

/**
 * Nephele htpasswd authenticator.
 *
 * For information on how to create .htpasswd files, see
 * https://httpd.apache.org/docs/current/programs/htpasswd.html
 */
export default class Authenticator implements AuthenticatorInterface {
  realm: string;
  unauthorizedAccess: boolean;
  authUserFilename: string;
  authUserFile?: string;
  blockAuthUserFilename: boolean;

  constructor({
    realm = 'Nephele WebDAV Service',
    unauthorizedAccess = false,
    authUserFilename = '.htpasswd',
    authUserFile = undefined,
    blockAuthUserFilename = true,
  }: AuthenticatorConfig = {}) {
    this.realm = realm;
    this.unauthorizedAccess = unauthorizedAccess;
    this.authUserFilename = authUserFilename;
    this.authUserFile = authUserFile;
    this.blockAuthUserFilename = blockAuthUserFilename;
  }

  async authenticate(request: Request, response: AuthResponse) {
    const authorization = request.get('Authorization');
    let username = '';
    let password = '';

    if (
      this.authUserFile == null &&
      this.blockAuthUserFilename &&
      (request.path.endsWith(`/${this.authUserFilename}`) ||
        request.path.endsWith(`/${this.authUserFilename}/`))
    ) {
      throw new ForbiddenError(
        "You don't have permission to access this resource."
      );
    }

    if (authorization) {
      const auth = basicAuth.parse(authorization);
      if (auth) {
        username = auth.name;
        password = auth.pass;
      }
    }

    try {
      if (username.trim() === '') {
        throw new UnauthorizedError(
          'Authentication is required to use this server.'
        );
      }

      const htpasswd = await this._getHtpasswdFile(request, response);

      if (!(await this._checkHtpasswd(username, password, htpasswd))) {
        throw new UnauthorizedError(
          'The provided credentials are not correct.'
        );
      }

      return new User({ username });
    } catch (e: any) {
      if (e instanceof UnauthorizedError) {
        response.set(
          'WWW-Authenticate',
          `Basic realm="${this.realm}", charset="UTF-8"`
        );
      }

      if (this.unauthorizedAccess) {
        return new User({ username: 'nobody' });
      }

      throw e;
    }
  }

  async cleanAuthentication(_request: Request, _response: AuthResponse) {
    // Nothing is required for auth cleanup.
    return;
  }

  async _checkHtpasswd(username: string, password: string, htpasswd: string) {
    let lines = htpasswd.split('\n');
    for (let line of lines) {
      const [user, digest, extra] = line.split(':');
      if (extra) {
        // This format means there is a realm, and it only works with Digest
        // authentication.
        continue;
      }
      if (user === username) {
        return await this._checkPassword(digest, password);
      }
    }
    return false;
  }

  async _checkPassword(digest: string, password: string) {
    if (digest.startsWith('$apr1$')) {
      return digest === apacheMD5(password, digest);
    } else if (digest.startsWith('{SHA}')) {
      let hash = crypto.createHash('sha1');
      hash.update(password);
      return '{SHA}' + hash.digest('base64') === digest;
    } else if (digest.startsWith('$2y$')) {
      return await bcrypt.compare(password, '$2b$' + digest.substring(4));
    }
    return digest === password || crypt(password, digest) === digest;
  }

  async _getHtpasswdFile(request: Request, response: AuthResponse) {
    if (this.authUserFile != null) {
      try {
        await fsp.access(this.authUserFile, constants.F_OK);

        return await fsp.readFile(this.authUserFile, { encoding: 'utf-8' });
      } catch (e: any) {
        throw new InternalServerError(
          "The server's authentication user file is not accessible."
        );
      }
    }

    const adapter = response.locals.adapter;
    const baseUrl = response.locals.baseUrl;

    const urlParts = request.path
      .substring(baseUrl.pathname.length)
      .replace(/(?:^\/|\/$)/g, '')
      .split('/');

    for (let i = 0; i < urlParts.length; i++) {
      const htpasswdUrl = new URL(
        `${[...urlParts.slice(0, i), ''].join('/')}${this.authUserFilename}`,
        baseUrl
      );
      let htpasswdResource: Resource | undefined = undefined;
      try {
        htpasswdResource = await adapter.getResource(htpasswdUrl, baseUrl);
      } catch (e: any) {
        if (e instanceof ResourceNotFoundError) {
          continue;
        }
        throw e;
      }

      if (htpasswdResource != null) {
        try {
          const stream = await htpasswdResource.getStream();
          return await this._streamToString(stream);
        } catch (e: any) {
          throw new InternalServerError(
            "The server's authentication user file is not accessible."
          );
        }
      }
    }

    return '';
  }

  _streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }
}
