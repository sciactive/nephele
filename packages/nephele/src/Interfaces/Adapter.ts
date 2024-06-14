import type { Request } from 'express';

import type { Method } from '../index.js';

import type { AuthResponse } from './Authenticator.js';
import type { Resource } from './Resource.js';
import type { User } from './User.js';

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
    response: AuthResponse,
  ): Promise<string[]>;

  /**
   * Get a list of allowed methods that this adapter supports.
   *
   * The standard set of WebDAV methods are already known, so don't include them
   * in the returned array. They include:
   *
   * GET, HEAD, POST, PUT, DELETE, COPY, MOVE, MKCOL, OPTIONS, LOCK, UNLOCK,
   * SEARCH, PROPFIND, and PROPPATCH
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
    response: AuthResponse,
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
    response: AuthResponse,
  ): Promise<string>;

  /**
   * See whether the request is authorized, based on a URL and a method.
   *
   * Don't take locks into consideration. Those are handled separately by
   * Nephele.
   *
   * @param url Resource URL.
   * @param method Request method.
   * @param baseUrl The root of the WebDav server's namespace on the server.
   * @param user The user to check authorization for.
   */
  isAuthorized(
    url: URL,
    method: string,
    baseUrl: URL,
    user: User,
  ): Promise<boolean>;

  /**
   * Get a resource's object.
   *
   * If the resource doesn't exist, a ResourceNotFoundError should be thrown.
   *
   * If the resource is not managed by this adapter, a BadGatewayError should be
   * thrown.
   *
   * @param url Resource URL.
   * @param baseUrl The root of the adapter's namespace on the server.
   */
  getResource(url: URL, baseUrl: URL): Promise<Resource>;

  /**
   * Create a new non-collection resource object.
   *
   * If the resource is not managed by this adapter, a BadGatewayError should be
   * thrown.
   *
   * @param url Resource URL.
   * @param baseUrl The root of the adapter's namespace on the server.
   */
  newResource(url: URL, baseUrl: URL): Promise<Resource>;

  /**
   * Create a new collection resource object.
   *
   * If the resource is not managed by this adapter, a BadGatewayError should be
   * thrown.
   *
   * @param url Resource URL.
   * @param baseUrl The root of the adapter's namespace on the server.
   */
  newCollection(url: URL, baseUrl: URL): Promise<Resource>;

  /**
   * Get a handler class for an additional method.
   *
   * Any thrown errors will be caught and reported in the response, along with
   * their message. If you need more sophisticated error handling, such as
   * returning specific error codes in certain situations, you should handle
   * errors within this class' `run` function.
   *
   * If the requested method is not supported (i.e. it is purposefully excluded
   * from the output from `getAllowedMethods`), a MethodNotSupportedError should
   * be thrown. If the method is not recognized, a MethodNotImplementedError
   * should be thrown.
   */
  getMethod(method: string): typeof Method;
}
