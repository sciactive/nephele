import type { Request } from 'express';

import type { AuthResponse } from './Authenticator.js';

export interface Plugin {
  /**
   * Run before processing has begun on a request.
   *
   * At this point, only the plugins will have been loaded. The adapter(s) and
   * authenticator(s) will not have been determined. As such, the request will
   * not have been authenticated at this point.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  prepare?: (request: Request, response: AuthResponse) => Promise<false | void>;
}
