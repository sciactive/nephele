import type { Request } from 'express';
import basicAuth from 'basic-auth';
import type {
  Authenticator as AuthenticatorInterface,
  AuthResponse as NepheleAuthResponse,
} from 'nephele';

import User from './User.js';

export type AuthResponse = NepheleAuthResponse<any, { user: User }>;

/**
 * Nephele PAM authenticator.
 *
 * Read the details on https://www.npmjs.com/package/authenticate-pam, which is
 * required for PAM authentication.
 */
export default class Authenticator implements AuthenticatorInterface {
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
    const user = new User({ username });
    await user.authenticate(password);

    return user;
  }

  async cleanAuthentication(_request: Request, _response: AuthResponse) {
    // Nothing is required for auth cleanup.
    return;
  }
}
