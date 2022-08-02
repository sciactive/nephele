import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';
import {
  BadRequestError,
  MediaTypeNotSupportedError,
  PreconditionFailedError,
} from '../Errors/index.js';

import { Method } from './Method.js';

export class MKCOL extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'MKCOL');

    const resource = await this.adapter.newCollection(url, request.baseUrl);

    // Check if header for etag.
    const ifMatch = request.get('If-Match');

    // It's a new resource, so any etag should fail.
    if (ifMatch != null) {
      throw new PreconditionFailedError('If-Match header check failed.');
    }

    const ifNoneMatch = request.get('If-None-Match');
    if (ifNoneMatch != null) {
      if (ifNoneMatch.trim() !== '*') {
        throw new BadRequestError(
          'If-None-Match, if provided, must be "*" on a MKCOL request.'
        );
      }
    }

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    let stream = await this.getBodyStream(request, response);

    stream.on('data', () => {
      response.locals.debug('Provided body to MKCOL.');
      throw new MediaTypeNotSupportedError(
        "This server doesn't understand the body sent in the request."
      );
    });

    await new Promise<void>((resolve, _reject) => {
      stream.on('end', () => {
        resolve();
      });
    });

    await resource.create(response.locals.user);

    response.status(201); // Created
    response.set({
      'Content-Location': (
        await resource.getCanonicalUrl(this.getRequestBaseUrl(request))
      ).pathname,
    });
    response.end();
  }
}
