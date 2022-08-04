import {
  BadGatewayError,
  BadRequestError,
  EncodingNotSupportedError,
  FailedDependencyError,
  ForbiddenError,
  InsufficientStorageError,
  LockedError,
  MediaTypeNotSupportedError,
  MethodNotImplementedError,
  MethodNotSupportedError,
  NotAcceptableError,
  PreconditionFailedError,
  PropertyIsProtectedError,
  RequestTimeoutError,
  RequestURITooLongError,
  ResourceExistsError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
  ServiceUnavailableError,
  UnauthorizedError,
  UnprocessableEntityError,
} from './Errors/index.js';

export function catchErrors<A extends any[], R = void>(
  fn: (...args: A) => Promise<R>,
  errorHandler: (
    code: number,
    message: string,
    error: Error,
    args: A
  ) => Promise<void>
) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e: any) {
      if (e instanceof BadRequestError) {
        // Bad Request
        await errorHandler(400, e.message, e, args);
        return;
      }

      if (e instanceof UnauthorizedError) {
        // Unauthorized
        await errorHandler(401, e.message, e, args);
        return;
      }

      if (e instanceof ForbiddenError) {
        // Forbidden
        await errorHandler(403, e.message, e, args);
        return;
      }

      if (e instanceof PropertyIsProtectedError) {
        // Forbidden
        await errorHandler(403, e.message, e, args);
        return;
      }

      if (e instanceof ResourceNotFoundError) {
        // Not Found
        await errorHandler(404, e.message, e, args);
        return;
      }

      if (e instanceof MethodNotSupportedError) {
        // Method Not Allowed
        await errorHandler(405, e.message, e, args);
        return;
      }

      if (e instanceof EncodingNotSupportedError) {
        // Not Acceptable
        await errorHandler(406, e.message, e, args);
        return;
      }

      if (e instanceof NotAcceptableError) {
        // Not Acceptable
        await errorHandler(406, e.message, e, args);
        return;
      }

      if (e instanceof RequestTimeoutError) {
        // Request Timeout
        await errorHandler(408, e.message, e, args);
        return;
      }

      if (e instanceof PreconditionFailedError) {
        // Precondition Failed
        await errorHandler(412, e.message, e, args);
        return;
      }

      if (e instanceof RequestURITooLongError) {
        // Request-URI Too Long
        await errorHandler(414, e.message, e, args);
        return;
      }

      if (e instanceof MediaTypeNotSupportedError) {
        // Unsupported Media Type
        await errorHandler(415, e.message, e, args);
        return;
      }

      if (e instanceof ResourceExistsError) {
        // Method Not Allowed
        await errorHandler(405, e.message, e, args);
        return;
      }

      if (e instanceof ResourceTreeNotCompleteError) {
        // Conflict
        await errorHandler(409, e.message, e, args);
        return;
      }

      if (e instanceof UnprocessableEntityError) {
        // Unprocessable Entity
        await errorHandler(422, e.message, e, args);
        return;
      }

      if (e instanceof LockedError) {
        // Locked
        await errorHandler(423, e.message, e, args);
        return;
      }

      if (e instanceof FailedDependencyError) {
        // Failed Dependency
        await errorHandler(424, e.message, e, args);
        return;
      }

      if (e instanceof MethodNotImplementedError) {
        // Not Implemented
        await errorHandler(501, e.message, e, args);
        return;
      }

      if (e instanceof BadGatewayError) {
        // Bad Gateway
        await errorHandler(502, e.message, e, args);
        return;
      }

      if (e instanceof ServiceUnavailableError) {
        // Service Unavailable
        await errorHandler(503, e.message, e, args);
        return;
      }

      if (e instanceof InsufficientStorageError) {
        // Insufficient Storage
        await errorHandler(507, e.message, e, args);
        return;
      }

      // Internal Server Error
      await errorHandler(500, e.message || 'Internal server error.', e, args);
    }
  };
}
