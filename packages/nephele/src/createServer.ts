import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request } from 'express';
import cookieParser from 'cookie-parser';
import createDebug from 'debug';
import { nanoid } from 'nanoid';

import type {
  Adapter,
  Authenticator,
  AuthResponse,
} from './Interfaces/index.js';
import type { Options } from './Options.js';
import { defaults } from './Options.js';
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
  {
    adapter,
    authenticator,
  }: { adapter: Adapter; authenticator: Authenticator },
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
        response.locals.user = await authenticator.authenticate(
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

  async function unauthenticate(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.on('close', async () => {
      try {
        await authenticator.cleanAuthentication(request, response);
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

  const methodProps = { adapter, authenticator };

  app.options('*', runMethodCatchErrors(new OPTIONS(methodProps, opts)));
  app.get('*', runMethodCatchErrors(new GET_HEAD(methodProps, opts)));
  app.head('*', runMethodCatchErrors(new GET_HEAD(methodProps, opts)));
  app.put('*', runMethodCatchErrors(new PUT(methodProps, opts)));
  app.delete('*', runMethodCatchErrors(new DELETE(methodProps, opts)));
  app.copy('*', runMethodCatchErrors(new COPY(methodProps, opts)));
  app.move('*', runMethodCatchErrors(new MOVE(methodProps, opts)));
  app.mkcol('*', runMethodCatchErrors(new MKCOL(methodProps, opts)));
  app.lock('*', runMethodCatchErrors(new LOCK(methodProps, opts)));
  app.unlock('*', runMethodCatchErrors(new UNLOCK(methodProps, opts)));
  // TODO: Available once rfc5323 is implemented.
  // app.search('*', runMethodCatchErrors(new SEARCH(methodProps, opts)));

  const propfind = runMethodCatchErrors(new PROPFIND(methodProps, opts));
  const proppatch = runMethodCatchErrors(new PROPPATCH(methodProps, opts));

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
            const MethodClass = adapter.getMethod(request.method);
            const method = new MethodClass(methodProps, opts);
            await method.run(request, response);
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
