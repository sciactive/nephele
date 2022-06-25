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
   * In the interest of being more user-friendly by default, this feature is
   * turned off. If you regularly transfer large, uncompressed files, you might
   * want to enable this feature. If you mostly transfer files that are already
   * compressed (encoded video, images, audio, compressed file archives, etc)
   * this option won't make a big difference.
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
  compression: false,
  realm: 'Nephele WebDAV Service',
  errorHandler: async (
    code: number,
    message: string,
    _request: Request,
    response: AuthResponse,
    error?: Error
  ) => {
    if (process.env.NODE_ENV !== 'production') {
      if (!response.headersSent) {
        response.setHeader('Content-Type', 'application/json');
      }
      response.send({
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
    } else {
      if (!response.headersSent) {
        response.setHeader('Content-Type', 'text/plain');
      }
      response.send(`Error ${code}: ${message}`);
    }
  },
};
