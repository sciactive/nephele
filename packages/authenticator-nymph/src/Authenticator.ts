import type { Request } from 'express';
import basicAuth from 'basic-auth';
import type { Nymph } from '@nymphjs/nymph';
import {
  User as UserClass,
  enforceTilmeld,
  type UserData,
} from '@nymphjs/tilmeld';
import type {
  Authenticator as AuthenticatorInterface,
  AuthResponse as NepheleAuthResponse,
} from 'nephele';
import { UnauthorizedError } from 'nephele';

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
   * The instance of Nymph that will authenticate the users. This must have
   * Tilmeld loaded.
   */
  nymph: Nymph;
};

export type AuthResponse = NepheleAuthResponse<
  any,
  { user: UserClass & UserData }
>;

/**
 * Nephele Nymph.js authenticator.
 */
export default class Authenticator implements AuthenticatorInterface {
  realm: string;
  nymph: Nymph;

  constructor(config: AuthenticatorConfig) {
    this.realm = config.realm || 'Nephele WebDAV Service';
    this.nymph = config.nymph;
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
          'Authentication is required to use this server.',
        );
      }

      enforceTilmeld(this.nymph);
      const User = this.nymph.getEntityClass(UserClass);
      const user = await User.factoryUsername(username);

      if (
        user.guid == null ||
        user.username == null ||
        !user.enabled ||
        !user.$checkPassword(password)
      ) {
        throw new UnauthorizedError('Username or password is invalid.');
      }

      return user as UserClass & UserData & { username: string };
    } catch (e: any) {
      if (e instanceof UnauthorizedError) {
        response.set(
          'WWW-Authenticate',
          `Basic realm="${this.realm}", charset="UTF-8"`,
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
