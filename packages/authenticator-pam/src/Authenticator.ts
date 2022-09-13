import type { Request } from 'express';
import basicAuth from 'basic-auth';
import type {
  Authenticator as AuthenticatorInterface,
  AuthResponse as NepheleAuthResponse,
} from 'nephele';
import { UnauthorizedError } from 'nephele';

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
   * Comma separated UID ranges that are allowed to log in.
   *
   * You can set, for example, "0,1000-1999" to allow the first 1000 normal
   * users and root to log in.
   *
   * Root is always UID 0. On most systems, daemon users are assigned UIDs in
   * the range 2-999, normal users are assigned UIDs in the range 1000-65533,
   * and the "nobody" user is assigned UID 65534. On some systems (including
   * macOS), normal users are assigned IDs starting at 500, which is why the
   * default includes this range.
   */
  allowedUIDs?: string;
};

export type AuthResponse = NepheleAuthResponse<any, { user: User }>;

/**
 * Nephele PAM authenticator.
 *
 * Read the details on https://www.npmjs.com/package/authenticate-pam, which is
 * required for PAM authentication.
 */
export default class Authenticator implements AuthenticatorInterface {
  realm: string;
  allowedUIDs: string[];

  constructor({
    realm = 'Nephele WebDAV Service',
    allowedUIDs = '500-59999',
  }: AuthenticatorConfig = {}) {
    this.realm = realm;
    this.allowedUIDs = allowedUIDs.split(',').map((range) => range.trim());
  }

  async authenticate(request: Request, response: AuthResponse) {
    const authorization = request.get('Authorization');
    let username = '';
    let password = '';

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

      const user = new User({ username });

      await user.authenticate(password, request.hostname);
      await user.checkUID(this.allowedUIDs);

      return user;
    } catch (e: any) {
      if (e instanceof UnauthorizedError) {
        response.set(
          'WWW-Authenticate',
          `Basic realm="${this.realm}", charset="UTF-8"`
        );
      }
      throw e;
    }
  }

  async cleanAuthentication(_request: Request, _response: AuthResponse) {
    // Nothing is required for auth cleanup.
    return;
  }
}
