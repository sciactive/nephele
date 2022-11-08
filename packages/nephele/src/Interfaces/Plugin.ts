import type { Request } from 'express';

import type { Method } from '../Methods/Method.js';

import type { AuthResponse } from './Authenticator.js';
import { Properties } from './Properties.js';
import { Resource } from './Resource.js';

export interface Plugin {
  // Request Lifecycle Related Events
  /**
   * Run before processing has begun on a request.
   *
   * At this point, only the plugins will have been loaded. The adapter(s) and
   * authenticator(s) will not have been determined. As such, the request will
   * not have been authenticated at this point.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  prepare?: (request: Request, response: AuthResponse) => Promise<false | void>;
  /**
   * Run directly before authentication.
   *
   * At this point, the authenticator is loaded, but the user has not yet been
   * authenticated. The adapter(s) will not have been determined.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeAuth?: (
    request: Request,
    response: AuthResponse
  ) => Promise<false | void>;
  /**
   * Run directly after authentication.
   *
   * At this point, the authenticator is loaded and the user is authenticated.
   * The adapter(s) will not have been determined.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  afterAuth?: (
    request: Request,
    response: AuthResponse
  ) => Promise<false | void>;
  /**
   * Run directly before the method is processed.
   *
   * At this point, the authenticator is loaded, the user is authenticated, and
   * the adapter is loaded. The method is about to be processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  begin?: (request: Request, response: AuthResponse) => Promise<false | void>;
  /**
   * Run after the method is processed and the response is closed.
   */
  close?: (request: Request, response: AuthResponse) => Promise<void>;

  // Method Specific Events
  /**
   * Run before a GET request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeGet?: (
    request: Request,
    response: AuthResponse,
    data: { method: Method; resource: Resource; properties: Properties }
  ) => Promise<false | void>;
  /**
   * Run after a GET request has been processed.
   */
  afterGet?: (request: Request, response: AuthResponse) => Promise<void>;
  /**
   * Run before a HEAD request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeHead?: (
    request: Request,
    response: AuthResponse,
    data: { method: Method; resource: Resource; properties: Properties }
  ) => Promise<false | void>;
  /**
   * Run after a HEAD request has been processed.
   */
  afterHead?: (request: Request, response: AuthResponse) => Promise<void>;
}
