import type { Request, Response } from 'express';
import type { Debugger } from 'debug';

import type { Resource } from './Resource.js';
import type { User } from './User.js';

export type AuthResponse<
  ResBody = any,
  Locals extends Record<string, any> = Record<string, any>
> = Response<ResBody, { user: User; debug: Debugger } & Locals>;

/**
 * An interface for a Nephele adapter.
 *
 * The adapter is responsible for providing Nephele with the information needed
 * to answer WebDAV queries and create, store, retrieve, modify, and delete
 * resources, collections, properties, and locks.
 */
export interface Adapter {
  /**
   * Get a list of compliance classes that this adapter supports.
   *
   * Compliance classes "1" and "3" are already known, since this is a WebDAV
   * server that implements RFC 4918, so don't include it in the returned array.
   *
   * Compliance class "2" means the adapter supports locks. Include this class
   * (the string "2") in the returned array to indicate that the "LOCK" and
   * "UNLOCK" methods should be included in the "Allow" header.
   */
  getComplianceClasses(
    url: URL,
    request: Request,
    response: AuthResponse
  ): Promise<string[]>;

  /**
   * Get a list of allowed methods that this adapter supports.
   *
   * The standard set of WebDAV methods are already known, so don't include them
   * in the returned array. They include:
   *
   * GET, HEAD, POST, PUT, PATCH, DELETE, COPY, MOVE, MKCOL, OPTIONS, LOCK,
   * UNLOCK, SEARCH, PROPFIND, and PROPPATCH
   *
   * LOCK and UNLOCK are only included if `getComplianceClasses` returns "2" in
   * the array when called with the same arguments.
   *
   * This method is used to build the "Allow" header.
   *
   * Any methods this function returns are entirely the responsibility of the
   * adapter to fulfill, beyond simple authorization and error responses.
   */
  getAllowedMethods(
    url: URL,
    request: Request,
    response: AuthResponse
  ): Promise<string[]>;

  /**
   * Get the "Cache-Control" header for the OPTIONS response.
   *
   * You probably just want to return something like "max-age=604800", unless
   * you're doing something URL specific.
   *
   * If you are doing something URL specific, consider if an attacker could use
   * that information to determine whether resources exist on a server and what
   * features they support.
   */
  getOptionsResponseCacheControl(
    url: URL,
    request: Request,
    response: AuthResponse
  ): Promise<string>;

  /**
   * Authenticate the user based on the data provided by the request.
   *
   * The object returned here will be placed in `response.locals.user`, and
   * sometimes passed to other functions that take a `User` argument.
   *
   * @param request The server request.
   * @param response The unauthenticated server response.
   */
  authenticate(request: Request, response: AuthResponse): Promise<User>;

  /**
   * Perform any sort of auth cleanup that needs to be done once the request is
   * complete.
   *
   * @param request The server request.
   * @param response The authenticated server response.
   */
  cleanAuthentication(request: Request, response: AuthResponse): Promise<void>;

  /**
   * See whether the request is authorized, based on a URL and a method.
   *
   * @param url Resource URL.
   * @param method Request method.
   * @param request The server request.
   * @param response The authenticated server response.
   */
  isAuthorized(
    url: URL,
    method: string,
    request: Request,
    response: AuthResponse
  ): Promise<boolean>;

  /**
   * Get a resource's object.
   *
   * @param url Resource URL.
   * @param request The server request.
   * @param response The authenticated server response.
   */
  getResource(
    url: URL,
    request: Request,
    response: AuthResponse
  ): Promise<Resource>;

  /**
   * Create a new non-collection resource object.
   *
   * @param url Resource URL.
   * @param request The server request.
   * @param response The authenticated server response.
   */
  newResource(
    url: URL,
    request: Request,
    response: AuthResponse
  ): Promise<Resource>;

  /**
   * Create a new collection resource object.
   *
   * @param url Resource URL.
   * @param request The server request.
   * @param response The authenticated server response.
   */
  newCollection(
    url: URL,
    request: Request,
    response: AuthResponse
  ): Promise<Resource>;
}
