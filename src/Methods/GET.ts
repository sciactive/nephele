import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';

import { GetOrHead } from './GetOrHead.js';

export class GET extends GetOrHead {
  async run(request: Request, response: AuthResponse) {
    return await this.runGetOrHead('GET', request, response);
  }
}
