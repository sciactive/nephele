import type { Request, Response } from 'express';
import type { Debugger } from 'debug';

import type {
  AdapterConfig,
  AuthenticatorConfig,
  PluginsConfig,
} from '../Options.js';

import type { Adapter } from './Adapter.js';
import type { User } from './User.js';
import type { Plugin } from './Plugin.js';

export type AuthResponse<
  ResBody = any,
  Locals extends Record<string, any> = Record<string, any>,
> = Response<
  ResBody,
  {
    adapterConfig: AdapterConfig;
    adapter: Adapter;
    authenticatorConfig: AuthenticatorConfig;
    authenticator: Authenticator;
    pluginsConfig: PluginsConfig;
    plugins: Plugin[];
    baseUrl: URL;
    user: User;
    requestId: string;
    debug: Debugger;
    error?: Error;
  } & Locals
>;

export interface Authenticator {
  /**
   * Authenticate the user based on the data provided by the request.
   *
   * The object returned here will be placed in `response.locals.user`, and
   * sometimes passed to other functions that take a `User` argument.
   *
   * If the request does not result in successful authentication, you should
   * throw an UnauthorizedError.
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
}
