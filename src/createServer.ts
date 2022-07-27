import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request } from 'express';
import cookieParser from 'cookie-parser';
import createDebug from 'debug';
import { nanoid } from 'nanoid';

import type { Adapter, AuthResponse } from './Interfaces/index.js';
import type { Options } from './Options.js';
import { defaults } from './Options.js';
import {
  BadRequestError,
  EncodingNotSupportedError,
  FailedDependencyError,
  ForbiddenError,
  InsufficientStorageError,
  LockedError,
  MediaTypeNotSupportedError,
  MethodNotSupportedError,
  NotAcceptableError,
  PreconditionFailedError,
  RequestURITooLongError,
  ResourceExistsError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
  UnauthorizedError,
  UnprocessableEntityError,
} from './Errors/index.js';
import {
  GET,
  HEAD,
  MKCOL,
  OPTIONS,
  POST,
  PROPFIND,
  PUT,
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
  adapter: Adapter,
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
      response.locals.debug(`Authenticating user.`);
      response.locals.user = await adapter.authenticate(request, response);
    } catch (e: any) {
      response.locals.debug(`Auth failed.`);
      response.locals.error = e;
      if (e instanceof UnauthorizedError) {
        response.status(401);
        response.set(
          'WWW-Authenticate',
          `Basic realm="${opts.realm}", charset="UTF-8"`
        );
        opts.errorHandler(401, 'Unauthorized.', request, response, e);
        return;
      }

      if (e instanceof ForbiddenError) {
        response.status(403);
        opts.errorHandler(403, 'Forbidden.', request, response, e);
        return;
      }

      response.locals.debug('Error: ', e);
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
        await adapter.cleanAuthentication(request, response);
      } catch (e: any) {
        response.locals.debug('Error during authentication cleanup: ', e);
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

  const catchAndReportErrors = (
    fn: (request: Request, response: AuthResponse) => Promise<void>
  ) => {
    return async (request: Request, response: AuthResponse) => {
      try {
        await fn(request, response);
      } catch (e: any) {
        response.locals.error = e;

        if (e instanceof BadRequestError) {
          response.status(400); // Bad Request
          opts.errorHandler(400, e.message, request, response, e);
          return;
        }

        if (e instanceof UnauthorizedError) {
          response.status(401); // Unauthorized
          opts.errorHandler(401, e.message, request, response);
          return;
        }

        if (e instanceof ForbiddenError) {
          response.status(403); // Forbidden
          opts.errorHandler(403, e.message, request, response, e);
          return;
        }

        if (e instanceof ResourceNotFoundError) {
          response.status(404); // Not Found
          opts.errorHandler(404, e.message, request, response, e);
          return;
        }

        if (e instanceof MethodNotSupportedError) {
          response.status(405); // Method Not Allowed
          opts.errorHandler(405, e.message, request, response, e);
          return;
        }

        if (e instanceof EncodingNotSupportedError) {
          response.status(406); // Not Acceptable
          opts.errorHandler(406, e.message, request, response, e);
          return;
        }

        if (e instanceof NotAcceptableError) {
          response.status(406); // Not Acceptable
          opts.errorHandler(406, e.message, request, response, e);
          return;
        }

        if (e instanceof PreconditionFailedError) {
          response.status(412); // Precondition Failed
          opts.errorHandler(412, e.message, request, response, e);
          return;
        }

        if (e instanceof RequestURITooLongError) {
          response.status(414); // Request-URI Too Long
          opts.errorHandler(414, e.message, request, response, e);
          return;
        }

        if (e instanceof MediaTypeNotSupportedError) {
          response.status(415); // Unsupported Media Type
          opts.errorHandler(415, e.message, request, response, e);
          return;
        }

        if (e instanceof ResourceExistsError) {
          response.status(405); // Method Not Allowed
          opts.errorHandler(405, e.message, request, response, e);
          return;
        }

        if (e instanceof ResourceTreeNotCompleteError) {
          response.status(409); // Conflict
          opts.errorHandler(409, e.message, request, response, e);
          return;
        }

        if (e instanceof UnprocessableEntityError) {
          response.status(422); // Unprocessable Entity
          opts.errorHandler(422, e.message, request, response, e);
          return;
        }

        if (e instanceof LockedError) {
          response.status(423); // Locked
          opts.errorHandler(423, e.message, request, response, e);
          return;
        }

        if (e instanceof FailedDependencyError) {
          response.status(424); // Failed Dependency
          opts.errorHandler(424, e.message, request, response, e);
          return;
        }

        if (e instanceof InsufficientStorageError) {
          response.status(507); // Insufficient Storage
          opts.errorHandler(507, e.message, request, response, e);
          return;
        }

        response.locals.debug('Unknown Error: ', e);
        response.status(500); // Internal Server Error
        opts.errorHandler(
          500,
          e.message || 'Internal server error.',
          request,
          response,
          e
        );
        return;
      }
    };
  };

  const opt = new OPTIONS(adapter, opts);
  app.options('*', catchAndReportErrors(opt.run.bind(opt)));

  const get = new GET(adapter, opts);
  app.get('*', catchAndReportErrors(get.run.bind(get)));

  const head = new HEAD(adapter, opts);
  app.head('*', catchAndReportErrors(head.run.bind(head)));

  const post = new POST(adapter, opts);
  app.post('*', catchAndReportErrors(post.run.bind(post)));

  const put = new PUT(adapter, opts);
  app.put('*', catchAndReportErrors(put.run.bind(put)));

  const patch = new Method(adapter, opts);
  app.patch('*', catchAndReportErrors(patch.run.bind(patch)));

  const del = new Method(adapter, opts);
  app.delete('*', catchAndReportErrors(del.run.bind(del)));

  const copy = new Method(adapter, opts);
  app.copy('*', catchAndReportErrors(copy.run.bind(copy)));

  const move = new Method(adapter, opts);
  app.move('*', catchAndReportErrors(move.run.bind(move)));

  const mkcol = new MKCOL(adapter, opts);
  app.mkcol('*', catchAndReportErrors(mkcol.run.bind(mkcol)));

  const lock = new Method(adapter, opts);
  app.lock('*', catchAndReportErrors(lock.run.bind(lock)));

  const unlock = new Method(adapter, opts);
  app.unlock('*', catchAndReportErrors(unlock.run.bind(unlock)));

  const search = new Method(adapter, opts);
  app.search('*', catchAndReportErrors(search.run.bind(search)));

  const propfind = new PROPFIND(adapter, opts);
  const proppatch = new Method(adapter, opts);

  app.all(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {
      switch (request.method) {
        case 'PROPFIND':
          await propfind.run(request, response);
          break;
        case 'PROPPATCH':
          await proppatch.run(request, response);
          break;
        default:
          const MethodClass = adapter.getMethod(request.method);
          const method = new MethodClass(adapter, opts);
          await method.run(request, response);
          break;
      }
    })
  );

  debug('Nephele server set up. Ready to start listening.');

  return app;
}
