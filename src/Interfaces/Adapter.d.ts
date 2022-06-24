import type { Request, Response } from 'express';
import type { Resource } from './Resource.js';
import type { User } from './User.js';

export type AuthResponse = Response<any, { user: User }>;

/**
 * An interface for a Nephele adapter.
 *
 * The adapter is responsible for providing Nephele with the information needed
 * to answer WebDAV queries and create, store, retrieve, modify, and delete
 * resources, collections, properties, and locks.
 */
export interface Adapter {
  /**
   * Authenticate the user based on the data provided by the request.
   *
   * @param request The server request.
   * @param response Store the auth data in `response.auth`.
   */
  authenticate(request: Request, response: AuthResponse): Promise<void>;

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
