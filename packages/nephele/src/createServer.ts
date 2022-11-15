import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request } from 'express';
import cookieParser from 'cookie-parser';
import createDebug from 'debug';
import { nanoid } from 'nanoid';

import type { AuthResponse } from './Interfaces/index.js';
import type { Config, Options } from './Options.js';
import {
  defaults,
  getAdapter,
  getAuthenticator,
  getPlugins,
} from './Options.js';
import { catchErrors } from './catchErrors.js';
import { ForbiddenError, UnauthorizedError } from './Errors/index.js';
import {
  COPY,
  DELETE,
  GET_HEAD,
  LOCK,
  MKCOL,
  MOVE,
  OPTIONS,
  PROPFIND,
  PROPPATCH,
  PUT,
  UNLOCK,
  Method,
} from './Methods/index.js';

const debug = createDebug('nephele:server');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json')).toString()
);

/**
 * A server middleware creator for Nephele, a WebDAV server library.
 *
 * In order to use this server, you must provide it with an adapter. Your
 * Nephele adapter is responsible for actually making changes to the
 * database/filsystem/whatever you use to manage resources.
 *
 * Written by Hunter Perrin for SciActive.
 *
 * @author Hunter Perrin <hperrin@gmail.com>
 * @copyright SciActive Inc
 * @see http://sciactive.com/
 */
export default function createServer(
  { adapter, authenticator, plugins }: Config,
  options: Partial<Options> = {}
) {
  const opts = Object.assign({}, defaults, options) as Options;

  const app = express();
  app.disable('etag');
  app.use(cookieParser());

  async function debugLogger(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.locals.requestId = nanoid(5);
    response.locals.debug = debug.extend(`${response.locals.requestId}`);
    response.locals.debug(
      `IP: ${request.ip}, Method: ${request.method}, URL: ${request.originalUrl}`
    );
    next();
  }

  // Log the details of the request.
  app.use(debugLogger);

  async function debugLoggerEnd(
    _request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.on('close', () => {
      response.locals.debug(
        `Response: ${response.statusCode} ${response.statusMessage || ''}`
      );

      if (response.locals.error) {
        response.locals.debug(
          `Error Message: ${response.locals.error.message}`
        );
      }
    });
    next();
  }

  // Log the details of the response.
  app.use(debugLoggerEnd);

  async function loadPlugins(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    if (typeof plugins === 'function') {
      const pluginArray = await plugins(request, response);
      response.locals.pluginsConfig = pluginArray;
      response.locals.plugins = getPlugins(
        decodeURIComponent(request.path).replace(/\/?$/, () => '/'),
        pluginArray
      );
    } else if (plugins != null) {
      response.locals.pluginsConfig = plugins;
      response.locals.plugins = getPlugins(
        decodeURIComponent(request.path).replace(/\/?$/, () => '/'),
        plugins
      );
    } else {
      response.locals.pluginsConfig = plugins;
      response.locals.plugins = [];
    }
    next();
  }

  // Get the plugins.
  app.use(loadPlugins);

  // Run plugin prepare.
  app.use(
    async (request: Request, response: AuthResponse, next: NextFunction) => {
      let ended = false;
      for (let plugin of response.locals.plugins) {
        if ('prepare' in plugin && plugin.prepare) {
          const result = await plugin.prepare(request, response);
          if (result === false) {
            ended = true;
          }
        }
      }
      if (!ended) {
        next();
      }
    }
  );

  async function loadAuthenticator(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    if (typeof authenticator === 'function') {
      const auth = await authenticator(request, response);
      response.locals.authenticatorConfig = auth;
      response.locals.authenticator = getAuthenticator(
        decodeURIComponent(request.path).replace(/\/?$/, () => '/'),
        auth
      );
    } else {
      response.locals.authenticatorConfig = authenticator;
      response.locals.authenticator = getAuthenticator(
        decodeURIComponent(request.path).replace(/\/?$/, () => '/'),
        authenticator
      );
    }
    next();
  }

  // Get the authenticator.
  app.use(loadAuthenticator);

  // Run plugin beforeAuth.
  app.use(
    async (request: Request, response: AuthResponse, next: NextFunction) => {
      let ended = false;
      for (let plugin of response.locals.plugins) {
        if ('beforeAuth' in plugin && plugin.beforeAuth) {
          const result = await plugin.beforeAuth(request, response);
          if (result === false) {
            ended = true;
          }
        }
      }
      if (!ended) {
        next();
      }
    }
  );

  async function authenticate(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    try {
      if (request.method === 'OPTIONS') {
        response.locals.debug(`Skipping authentication for OPTIONS request.`);
      } else {
        response.locals.debug(`Authenticating user.`);
        response.locals.user = await response.locals.authenticator.authenticate(
          request,
          response
        );
      }
    } catch (e: any) {
      response.locals.debug(`Auth failed.`);
      response.locals.error = e;
      if (e instanceof UnauthorizedError) {
        response.status(401);
        opts.errorHandler(401, 'Unauthorized.', request, response, e);
        return;
      }

      if (e instanceof ForbiddenError) {
        response.status(403);
        opts.errorHandler(403, 'Forbidden.', request, response, e);
        return;
      }

      response.locals.debug('Error: %o', e);
      response.status(500);
      opts.errorHandler(500, 'Internal server error.', request, response, e);
      return;
    }
    next();
  }

  // Authenticate before the request.
  app.use(authenticate);

  // Run plugin afterAuth.
  app.use(
    async (request: Request, response: AuthResponse, next: NextFunction) => {
      let ended = false;
      for (let plugin of response.locals.plugins) {
        if ('afterAuth' in plugin && plugin.afterAuth) {
          const result = await plugin.afterAuth(request, response);
          if (result === false) {
            ended = true;
          }
        }
      }
      if (!ended) {
        next();
      }
    }
  );

  async function loadAdapter(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    if (typeof adapter === 'function') {
      const adapt = await adapter(request, response);
      response.locals.adapterConfig = adapt;
      const parsedAdapter = getAdapter(
        decodeURIComponent(request.path).replace(/\/?$/, () => '/'),
        adapt
      );
      response.locals.adapter = parsedAdapter.adapter;
      response.locals.baseUrl = new URL(
        path.join(request.baseUrl || '/', parsedAdapter.baseUrl),
        `${request.protocol}://${request.headers.host}`
      );
    } else {
      response.locals.adapterConfig = adapter;
      const parsedAdapter = getAdapter(
        decodeURIComponent(request.path).replace(/\/?$/, () => '/'),
        adapter
      );
      response.locals.adapter = parsedAdapter.adapter;
      response.locals.baseUrl = new URL(
        path.join(request.baseUrl || '/', parsedAdapter.baseUrl),
        `${request.protocol}://${request.headers.host}`
      );
    }
    next();
  }

  // Get the adapter.
  app.use(loadAdapter);

  async function unauthenticate(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.on('close', async () => {
      try {
        await response.locals.authenticator.cleanAuthentication(
          request,
          response
        );
      } catch (e: any) {
        response.locals.debug('Error during authentication cleanup: %o', e);
      }
    });
    next();
  }

  // Unauthenticate after the request.
  app.use(unauthenticate);

  async function addServerHeader(
    _request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.set({
      Server: `${pkg.name}/${pkg.version}`,
    });
    next();
  }

  // Add the server header to the response.
  app.use(addServerHeader);

  async function checkRequestPath(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    const splitPath = request.path.split('/');
    if (splitPath.includes('..') || splitPath.includes('.')) {
      response.status(400);
      opts.errorHandler(400, 'Bad request.', request, response);
      return;
    }
    next();
  }

  // Check the request path for '.' or '..' segments.
  app.use(checkRequestPath);

  const runMethodCatchErrors = (method: Method) => {
    return catchErrors(
      method.run.bind(method),
      async (code, message, error, [request, response]) => {
        await opts.errorHandler(code, message, request, response, error);
      }
    );
  };

  // Run plugin begin.
  app.use(
    async (request: Request, response: AuthResponse, next: NextFunction) => {
      let ended = false;
      for (let plugin of response.locals.plugins) {
        if ('begin' in plugin && plugin.begin) {
          const result = await plugin.begin(request, response);
          if (result === false) {
            ended = true;
          }
        }
      }
      if (!ended) {
        next();
      }
    }
  );

  // Run plugin close.
  app.use(
    async (request: Request, response: AuthResponse, next: NextFunction) => {
      response.on('close', async () => {
        for (let plugin of response.locals.plugins) {
          if ('close' in plugin && plugin.close) {
            await plugin.close(request, response);
          }
        }
      });
      next();
    }
  );

  app.options('*', runMethodCatchErrors(new OPTIONS(opts)));
  app.get('*', runMethodCatchErrors(new GET_HEAD(opts)));
  app.head('*', runMethodCatchErrors(new GET_HEAD(opts)));
  app.put('*', runMethodCatchErrors(new PUT(opts)));
  app.delete('*', runMethodCatchErrors(new DELETE(opts)));
  app.copy('*', runMethodCatchErrors(new COPY(opts)));
  app.move('*', runMethodCatchErrors(new MOVE(opts)));
  app.mkcol('*', runMethodCatchErrors(new MKCOL(opts)));
  app.lock('*', runMethodCatchErrors(new LOCK(opts)));
  app.unlock('*', runMethodCatchErrors(new UNLOCK(opts)));
  // TODO: Available once rfc5323 is implemented.
  // app.search('*', runMethodCatchErrors(new SEARCH(opts)));

  const propfind = runMethodCatchErrors(new PROPFIND(opts));
  const proppatch = runMethodCatchErrors(new PROPPATCH(opts));

  app.all('*', async (request, response: AuthResponse) => {
    switch (request.method) {
      case 'PROPFIND':
        await propfind(request, response);
        break;
      case 'PROPPATCH':
        await proppatch(request, response);
        break;
      default:
        const run = catchErrors(
          async () => {
            const pluginMethod = new Method(opts);
            let { url } = pluginMethod.getRequestData(request, response);

            if (
              await pluginMethod.runPlugins(request, response, 'beginMethod', {
                method: request.method,
                url,
              })
            ) {
              return;
            }
            if (
              await pluginMethod.runPlugins(request, response, 'preMethod', {
                method: request.method,
                url,
              })
            ) {
              return;
            }

            const MethodClass = response.locals.adapter.getMethod(
              request.method
            );
            const method = new MethodClass(opts);

            if (
              await method.runPlugins(request, response, 'beforeMethod', {
                method,
                url,
              })
            ) {
              return;
            }

            await method.run(request, response);

            await method.runPlugins(request, response, 'afterMethod', {
              method,
              url,
            });
          },
          async (code, message, error) => {
            await opts.errorHandler(code, message, request, response, error);
          }
        );
        await run();
        break;
    }
  });

  debug('Nephele server set up. Ready to start listening.');

  return app;
}
