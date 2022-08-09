import type { Request } from 'express';
import type {
  Authenticator as AuthenticatorInterface,
  AuthResponse as NepheleAuthResponse,
} from 'nephele';

import User from './User.js';

export type AuthResponse = NepheleAuthResponse<any, { user: User }>;

/**
 * Nephele insecure authenticator.
 *
 * This authenticator allows complete access to your server by any user.
 */
export default class Authenticator implements AuthenticatorInterface {
  async authenticate(_request: Request, _response: AuthResponse) {
    return new User({ username: 'nobody' });
  }

  async cleanAuthentication(_request: Request, _response: AuthResponse) {
    // Nothing is required for auth cleanup.
    return;
  }
}
