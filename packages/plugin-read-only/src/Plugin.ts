import type { Request } from 'express';
import type { Plugin as PluginInterface, AuthResponse } from 'nephele';
import { UnauthorizedError } from 'nephele';

export type PluginConfig = {};

/**
 * Nephele read-only plugin.
 *
 * This plugin makes a path read-only.
 */
export default class Plugin implements PluginInterface {
  constructor({}: PluginConfig = {}) {}

  async beforeCheckAuthorization(
    _request: Request,
    _response: AuthResponse,
    { methodName }: { methodName: string },
  ) {
    if (
      methodName !== 'GET' &&
      methodName !== 'HEAD' &&
      methodName !== 'PROPFIND'
    ) {
      throw new UnauthorizedError('Unauthorized.');
    }
  }

  async beforeOptions(
    _request: Request,
    _res: AuthResponse,
    { allowedMethods }: { allowedMethods: string[] },
  ) {
    for (let i = 0; i < allowedMethods.length; i++) {
      // Explicitly allowed methods:
      // 'OPTIONS'
      // 'GET'
      // 'HEAD'
      if (
        [
          'POST',
          'PUT',
          'DELETE',
          'COPY',
          'MOVE',
          'MKCOL',
          'PROPFIND',
          'PROPPATCH',
          'LOCK',
          'UNLOCK',
        ].includes(allowedMethods[i])
      ) {
        allowedMethods.splice(i, 1);
        i--;
      }
    }

    console.log({ allowedMethods });
  }
}
