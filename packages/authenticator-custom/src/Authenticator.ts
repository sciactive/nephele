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
   * A function that takes a username and password and returns a promise that
   * resolves to a user if the authentication succeeds, or null otherwise.
   */
  auth: (username: string, password: string) => Promise<User | null>;
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
 * Nephele custom authenticator.
 */
export default class Authenticator implements AuthenticatorInterface {
  auth: (username: string, password: string) => Promise<User | null>;
  realm: string;

  constructor({ auth, realm = 'Nephele WebDAV Service' }: AuthenticatorConfig) {
    this.auth = auth;
    this.realm = realm;
  }

  async authenticate(request: Request, response: AuthResponse) {
    const authorization = request.get('Authorization');
    let username = '';
    let password = '';

    try {
      if (authorization) {
        const auth = basicAuth.parse(authorization);
        if (auth) {
          username = auth.name;
          password = auth.pass;
        }
      }

      if (username === '' && password === '') {
        throw new UnauthorizedError(
          'You must authenticate to access this server.'
        );
      }

      const user = await this.auth(username, password);

      if (user == null) {
        throw new UnauthorizedError(
          'The credentials you provided were not correct.'
        );
      }

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
