import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';
import { LockedError, MediaTypeNotSupportedError } from '../Errors/index.js';

import { Method } from './Method.js';

export class MKCOL extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'MKCOL');

    const resource = await this.adapter.newCollection(url, request.baseUrl);

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

    const lockPermission = await this.getLockPermission(
      request,
      resource,
      response.locals.user
    );

    // Check that the resource wouldn't be added to a locked collection.
    if (lockPermission === 1) {
      throw new LockedError(
        'The user does not have permission to add a new resource to the locked collection.'
      );
    }

    if (lockPermission === 0) {
      throw new LockedError(
        'The user does not have permission to create the locked resource.'
      );
    }

    await this.checkConditionalHeaders(request, response);

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    await resource.create(response.locals.user);

    response.status(201); // Created
    response.set({
      Location: (
        await resource.getCanonicalUrl(this.getRequestBaseUrl(request))
      ).toString(),
    });
    response.end();
  }
}
