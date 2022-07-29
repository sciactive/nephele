import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';
import { MediaTypeNotSupportedError } from '../Errors/index.js';

import { Method } from './Method.js';

export class OPTIONS extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    const complianceClasses = [
      '1',
      '3',
      ...(await this.adapter.getComplianceClasses(url, request, response)),
    ];
    const allowedMethods = [
      'OPTIONS',
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'DELETE',
      'COPY',
      'MOVE',
      'MKCOL',
      // 'SEARCH', // TODO: Available once rfc5323 is implemented.
      'PROPFIND',
      'PROPPATCH',
      ...(complianceClasses.includes('2') ? ['LOCK', 'UNLOCK'] : []),
      ...(await this.adapter.getAllowedMethods(url, request, response)),
    ];
    const cacheControl = await this.adapter.getOptionsResponseCacheControl(
      url,
      request,
      response
    );

    request.on('data', () => {
      response.locals.debug('Provided body to OPTIONS.');
      throw new MediaTypeNotSupportedError(
        "This server doesn't understand the body sent in the request."
      );
    });

    await new Promise<void>((resolve, _reject) => {
      request.on('end', () => {
        resolve();
      });
    });

    response.status(204); // No Content
    response.set({
      'Cache-Control': cacheControl,
      Date: new Date().toUTCString(),
      Allow: allowedMethods.join(', '),
      DAV: complianceClasses.join(', '),
    });
    response.end();
  }
}
