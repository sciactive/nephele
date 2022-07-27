import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';

import { GetOrHead } from './GetOrHead.js';

export class HEAD extends GetOrHead {
  async run(request: Request, response: AuthResponse) {
    return await this.runGetOrHead('HEAD', request, response);
  }
}
