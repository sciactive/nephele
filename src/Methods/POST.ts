import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';
import { MethodNotSupportedError } from '../Errors/index.js';

import { Method } from './Method.js';

export class POST extends Method {
  async run(_request: Request, _response: AuthResponse) {
    // What does a POST do in WebDAV?
    throw new MethodNotSupportedError(
      'POST is not implemented on this server.'
    );
  }
}
