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

  constructor({ realm = 'Nephele WebDAV Service' }: AuthenticatorConfig = {}) {
    this.realm = realm;
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
    const user = new User({ username });
    try {
      await user.authenticate(password, request.hostname);
    } catch (e: any) {
      if (e instanceof UnauthorizedError) {
        response.set(
          'WWW-Authenticate',
          `Basic realm="${this.realm}", charset="UTF-8"`
        );
      }
      throw e;
    }

    return user;
  }

  async cleanAuthentication(_request: Request, _response: AuthResponse) {
    // Nothing is required for auth cleanup.
    return;
  }
}
