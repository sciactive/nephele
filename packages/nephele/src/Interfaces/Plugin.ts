import type { Request } from 'express';

import type { Method } from '../Methods/Method.js';

import type { AuthResponse } from './Authenticator.js';
import { Properties } from './Properties.js';
import { Resource } from './Resource.js';
import { Lock } from './Lock.js';

export interface Plugin {
  //
  // Request Lifecycle Related Events
  //

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

  //
  // Authorization Events
  //

  /**
   * Run before authorization is checked for a method.
   */
  beforeCheckAuthorization?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      methodName: string;
      url: URL;
    }
  ) => Promise<void>;
  /**
   * Run after authorization is checked for a method.
   *
   * If this is run, it means the user *has* authorization for the method.
   */
  afterCheckAuthorization?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      methodName: string;
      url: URL;
    }
  ) => Promise<void>;

  //
  // Method Specific Events
  //

  /**
   * Run when a GET request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginGet?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a GET request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preGet?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      properties: Properties;
    }
  ) => Promise<false | void>;
  /**
   * Run before a GET request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeGet?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      properties: Properties;
    }
  ) => Promise<false | void>;
  /**
   * Run after a GET request has been processed.
   */
  afterGet?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      properties: Properties;
    }
  ) => Promise<void>;

  /**
   * Run when a HEAD request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginHead?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a HEAD request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preHead?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      properties: Properties;
    }
  ) => Promise<false | void>;
  /**
   * Run before a HEAD request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeHead?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      properties: Properties;
    }
  ) => Promise<false | void>;
  /**
   * Run after a HEAD request has been processed.
   */
  afterHead?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      properties: Properties;
    }
  ) => Promise<void>;

  /**
   * Run when a COPY request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginCopy?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a COPY request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preCopy?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      destination: URL | undefined;
      depth: string;
      overwrite: string | undefined;
    }
  ) => Promise<false | void>;
  /**
   * Run before a COPY request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeCopy?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      destination: Resource;
      exists: boolean;
      depth: string;
      overwrite: string | undefined;
    }
  ) => Promise<false | void>;
  /**
   * Run after a COPY request has been processed.
   */
  afterCopy?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      destination: Resource;
      exists: boolean;
      depth: string;
      overwrite: string | undefined;
    }
  ) => Promise<void>;

  /**
   * Run when a DELETE request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginDelete?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a DELETE request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preDelete?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<false | void>;
  /**
   * Run before a DELETE request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeDelete?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<false | void>;
  /**
   * Run after a DELETE request has been processed.
   */
  afterDelete?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<void>;

  /**
   * Run when a LOCK request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginLock?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a LOCK request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preLock?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<false | void>;
  /**
   * Run before a LOCK refresh request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preLockRefresh?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<false | void>;
  /**
   * Run before a LOCK refresh request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeLockRefresh?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      lock: Lock;
    }
  ) => Promise<false | void>;
  /**
   * Run before a LOCK request has been processed, and before the provisional
   * lock for the request has been created.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeLockProvisional?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<false | void>;
  /**
   * Run before a LOCK request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeLock?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      lock: Lock;
    }
  ) => Promise<false | void>;
  /**
   * Run after a LOCK request has been processed.
   */
  afterLock?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      lock: Lock;
    }
  ) => Promise<void>;

  /**
   * Run when a MKCOL request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginMkcol?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a MKCOL request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preMkcol?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<false | void>;
  /**
   * Run before a MKCOL request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeMkcol?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<false | void>;
  /**
   * Run after a MKCOL request has been processed.
   */
  afterMkcol?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
    }
  ) => Promise<void>;

  /**
   * Run when a MOVE request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginMove?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a MOVE request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preMove?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      destination: URL | undefined;
      overwrite: string | undefined;
    }
  ) => Promise<false | void>;
  /**
   * Run before a MOVE request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeMove?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      destination: Resource;
      exists: boolean;
      overwrite: string | undefined;
    }
  ) => Promise<false | void>;
  /**
   * Run after a MOVE request has been processed.
   */
  afterMove?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      destination: Resource;
      exists: boolean;
      overwrite: string | undefined;
    }
  ) => Promise<void>;

  /**
   * Run when an OPTIONS request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginOptions?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before an OPTIONS request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preOptions?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
      complianceClasses: string[];
      allowedMethods: string[];
      cacheControl: string;
    }
  ) => Promise<false | void>;
  /**
   * Run before an OPTIONS request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeOptions?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
      complianceClasses: string[];
      allowedMethods: string[];
      cacheControl: string;
    }
  ) => Promise<false | void>;
  /**
   * Run after an OPTIONS request has been processed.
   */
  afterOptions?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
      complianceClasses: string[];
      allowedMethods: string[];
      cacheControl: string;
    }
  ) => Promise<void>;

  /**
   * Run when a PROPFIND request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginPropfind?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a PROPFIND request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  prePropfind?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      depth: string;
    }
  ) => Promise<false | void>;
  /**
   * Run before a PROPFIND request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforePropfind?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      depth: string;
    }
  ) => Promise<false | void>;
  /**
   * Run after a PROPFIND request has been processed.
   */
  afterPropfind?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      depth: string;
    }
  ) => Promise<void>;

  /**
   * Run when a PROPPATCH request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginProppatch?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a PROPPATCH request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preProppatch?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      depth: string;
    }
  ) => Promise<false | void>;
  /**
   * Run before a PROPPATCH request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeProppatch?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      depth: string;
    }
  ) => Promise<false | void>;
  /**
   * Run after a PROPPATCH request has been processed.
   */
  afterProppatch?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      depth: string;
    }
  ) => Promise<void>;

  /**
   * Run when a PUT request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginPut?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before a PUT request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  prePut?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      newResource: boolean;
    }
  ) => Promise<false | void>;
  /**
   * Run before a PUT request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforePut?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      newResource: boolean;
    }
  ) => Promise<false | void>;
  /**
   * Run after a PUT request has been processed.
   */
  afterPut?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      newResource: boolean;
    }
  ) => Promise<void>;

  /**
   * Run when an UNLOCK request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginUnlock?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before an UNLOCK request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preUnlock?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      lockTokenHeader: string | undefined;
    }
  ) => Promise<false | void>;
  /**
   * Run before an UNLOCK request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeUnlock?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      token: string;
      lock: Lock | undefined;
    }
  ) => Promise<false | void>;
  /**
   * Run after an UNLOCK request has been processed.
   */
  afterUnlock?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      resource: Resource;
      token: string;
      lock: Lock | undefined;
    }
  ) => Promise<void>;

  /**
   * Run when an unknown method request is starting.
   *
   * Note that this is run before even authorization to run the method has been
   * checked.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beginMethod?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before an unknown method request has been checked and processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  preMethod?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: string;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run before an unknown method request has been processed.
   *
   * Return false if and only if you have provided a response and wish to stop
   * processing.
   */
  beforeMethod?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<false | void>;
  /**
   * Run after an unknown method request has been processed.
   */
  afterMethod?: (
    request: Request,
    response: AuthResponse,
    data: {
      method: Method;
      url: URL;
    }
  ) => Promise<void>;
}
