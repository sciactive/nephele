import { Request } from 'express';

import type { AuthResponse } from './Interfaces/index.js';

export interface Options {
  /**
   * Use compression while transferring files from the server to the client.
   *
   * This can reduce transfer times, but at the cost of not having progress
   * bars, since it's not feasible for the server to know the total size of the
   * transfer before it begins sending data and report that to the client.
   *
   * Even with this option turned on, Nephele will check if the content has
   * already been compressed (based on its media type), and if it has, such as a
   * zip archive, it will be transmitted without the additional compression
   * step.
   *
   * Compression from client to server is always supported and can't be turned
   * off.
   */
  compression: boolean;
  /**
   * The realm is the name reported by the server when the user is prompted to
   * authenticate.
   *
   * It should be HTTP header safe (shouldn't include double quotes or
   * semicolon).
   */
  realm: string;
  /**
   * Timeout for reading data from the request.
   *
   * If the client doesn't provide data for this many milliseconds, the server
   * will give up waiting and issue an error.
   */
  timeout: number;
  /**
   * The minimum length of time a lock can be granted for, in milliseconds.
   */
  minLockTimeout: number;
  /**
   * The maximum length of time a lock can be granted for, in milliseconds.
   */
  maxLockTimeout: number;
  /**
   * The error handler is used to send a human readable error message back to
   * the user. When called, the response code will have already been set, but no
   * body content will have been sent.
   */
  errorHandler: (
    code: number,
    message: string,
    request: Request,
    response: AuthResponse,
    error?: Error
  ) => Promise<void>;
}

export const defaults: Options = {
  compression: true,
  realm: 'Nephele WebDAV Service',
  timeout: 30000,
  minLockTimeout: 1000 * 10, // 10 seconds
  maxLockTimeout: 1000 * 60 * 60 * 18, // 18 hours.
  errorHandler: async (
    code: number,
    message: string,
    _request: Request,
    response: AuthResponse,
    error?: Error
  ) => {
    if (error) {
      response.locals.error = error;
    }

    if (code === 500 && error) {
      response.locals.debug('Unknown Error: ', error);
    }

    if (response.destroyed) {
      return;
    }

    let body = `Error ${code}: ${message}`;
    let contentType = 'text/plain';
    if (process.env.NODE_ENV !== 'production') {
      body = JSON.stringify({
        code,
        message,
        ...(error
          ? {
              errorMessage: error.message,
              stack: error.stack,
              error,
            }
          : {}),
      });
      contentType = 'application/json';
    }
    if (!response.headersSent) {
      response.status(code);
      response.set({
        'Content-Type': `${contentType}; charset=utf-8`,
        'Content-Length': body.length,
      });
    }
    response.send(body);
  },
};
