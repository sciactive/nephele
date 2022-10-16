import { Request } from 'express';

import type { ResourceNotModifiedError } from './Errors/index.js';
import type {
  Adapter,
  Authenticator,
  AuthResponse,
  Plugin,
} from './Interfaces/index.js';

export type AdapterConfig = Adapter | { [k: string]: Adapter };

type DefinedAdapter = {
  adapter: AdapterConfig;
};

type DynamicAdapter = {
  adapter: (request: Request, response: AuthResponse) => Promise<AdapterConfig>;
};

export type AuthenticatorConfig =
  | Authenticator
  | { [k: string]: Authenticator };

type DefinedAuthenticator = {
  authenticator: AuthenticatorConfig;
};

type DynamicAuthenticator = {
  authenticator: (
    request: Request,
    response: AuthResponse
  ) => Promise<AuthenticatorConfig>;
};

type Plugins = Plugin[];

export type PluginsConfig = Plugins | { [k: string]: Plugins } | undefined;

type DefinedPlugins = {
  plugins?: PluginsConfig;
};

type DynamicPlugins = {
  plugins?: (
    request: Request,
    response: AuthResponse
  ) => Promise<PluginsConfig>;
};

export type Config = (DefinedAdapter | DynamicAdapter) &
  (DefinedAuthenticator | DynamicAuthenticator) &
  (DefinedPlugins | DynamicPlugins);

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
   *
   * Note that this is known to cause issues in some applications, such as
   * gedit, which will request gzipped data, then incorrectly show the
   * compressed data to the user.
   */
  compression: boolean;
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
  compression: false,
  timeout: 30000,
  minLockTimeout: 1000 * 10, // 10 seconds
  maxLockTimeout: 1000 * 60 * 60 * 18, // 18 hours.
  errorHandler: async (
    code: number,
    message: string,
    _request: Request,
    response: AuthResponse,
    error?: Error | ResourceNotModifiedError
  ) => {
    if (code < 400) {
      if (response.headersSent || response.destroyed) {
        response.end();
        return;
      }

      // Not really errors.
      response.status(code);
      if (error && 'etag' in error && error.etag) {
        response.set({
          ETag: error.etag,
        });
      }
      if (error && 'lastModified' in error && error.lastModified) {
        response.set({
          'Last-Modified': error.lastModified.toUTCString(),
        });
      }
      response.end();
      return;
    }

    if (error) {
      response.locals.error = error;
    }

    if (code === 500 && error) {
      response.locals.debug('Unknown Error: %o', error);
    }

    if (response.headersSent || response.destroyed) {
      response.end();
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

export function getAdapter(
  unencodedPath: string,
  config: AdapterConfig
): { adapter: Adapter; baseUrl: string } {
  if ('getComplianceClasses' in config) {
    return { adapter: config as Adapter, baseUrl: '/' };
  } else {
    const keys = Object.keys(config).sort((a, b) => b.length - a.length);
    const key = keys.find((key) => (unencodedPath || '/').startsWith(key));

    if (!key) {
      throw new Error(
        `Adapter not found for route "${unencodedPath}". You should always have an adapter for the root path "/".`
      );
    }

    return { adapter: config[key], baseUrl: key };
  }
}

export function getAuthenticator(
  unencodedPath: string,
  config: AuthenticatorConfig
): Authenticator {
  if ('authenticate' in config) {
    return config as Authenticator;
  } else {
    const keys = Object.keys(config).sort((a, b) => b.length - a.length);
    const key = keys.find((key) => (unencodedPath || '/').startsWith(key));

    if (!key) {
      throw new Error(
        `Authenticator not found for route "${unencodedPath}". You should always have an authenticator for the root path "/".`
      );
    }

    return config[key];
  }
}

export function getPlugins(
  unencodedPath: string,
  config: PluginsConfig
): Plugins {
  if (Array.isArray(config)) {
    return config as Plugins;
  } else if (config != null) {
    const keys = Object.keys(config).sort((a, b) => b.length - a.length);
    const key = keys.find((key) => (unencodedPath || '/').startsWith(key));

    if (!key) {
      return [];
    }

    return config[key];
  } else {
    return [];
  }
}
