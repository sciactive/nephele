import { Request } from 'express';

import type { AuthResponse } from './Interfaces/index.js';
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

export function catchErrors(
  fn: (request: Request, response: AuthResponse) => Promise<void>,
  errorHandler: (
    code: number,
    message: string,
    request: Request,
    response: AuthResponse,
    error?: Error
  ) => Promise<void>
) {
  return async (request: Request, response: AuthResponse) => {
    try {
      await fn(request, response);
    } catch (e: any) {
      response.locals.error = e;

      if (e instanceof BadRequestError) {
        response.status(400); // Bad Request
        errorHandler(400, e.message, request, response, e);
        return;
      }

      if (e instanceof UnauthorizedError) {
        response.status(401); // Unauthorized
        errorHandler(401, e.message, request, response);
        return;
      }

      if (e instanceof ForbiddenError) {
        response.status(403); // Forbidden
        errorHandler(403, e.message, request, response, e);
        return;
      }

      if (e instanceof ResourceNotFoundError) {
        response.status(404); // Not Found
        errorHandler(404, e.message, request, response, e);
        return;
      }

      if (e instanceof MethodNotSupportedError) {
        response.status(405); // Method Not Allowed
        errorHandler(405, e.message, request, response, e);
        return;
      }

      if (e instanceof EncodingNotSupportedError) {
        response.status(406); // Not Acceptable
        errorHandler(406, e.message, request, response, e);
        return;
      }

      if (e instanceof NotAcceptableError) {
        response.status(406); // Not Acceptable
        errorHandler(406, e.message, request, response, e);
        return;
      }

      if (e instanceof PreconditionFailedError) {
        response.status(412); // Precondition Failed
        errorHandler(412, e.message, request, response, e);
        return;
      }

      if (e instanceof RequestURITooLongError) {
        response.status(414); // Request-URI Too Long
        errorHandler(414, e.message, request, response, e);
        return;
      }

      if (e instanceof MediaTypeNotSupportedError) {
        response.status(415); // Unsupported Media Type
        errorHandler(415, e.message, request, response, e);
        return;
      }

      if (e instanceof ResourceExistsError) {
        response.status(405); // Method Not Allowed
        errorHandler(405, e.message, request, response, e);
        return;
      }

      if (e instanceof ResourceTreeNotCompleteError) {
        response.status(409); // Conflict
        errorHandler(409, e.message, request, response, e);
        return;
      }

      if (e instanceof UnprocessableEntityError) {
        response.status(422); // Unprocessable Entity
        errorHandler(422, e.message, request, response, e);
        return;
      }

      if (e instanceof LockedError) {
        response.status(423); // Locked
        errorHandler(423, e.message, request, response, e);
        return;
      }

      if (e instanceof FailedDependencyError) {
        response.status(424); // Failed Dependency
        errorHandler(424, e.message, request, response, e);
        return;
      }

      if (e instanceof InsufficientStorageError) {
        response.status(507); // Insufficient Storage
        errorHandler(507, e.message, request, response, e);
        return;
      }

      response.locals.debug('Unknown Error: ', e);
      response.status(500); // Internal Server Error
      errorHandler(
        500,
        e.message || 'Internal server error.',
        request,
        response,
        e
      );
      return;
    }
  };
}
