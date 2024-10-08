import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';
import { MediaTypeNotSupportedError } from '../Errors/index.js';

import { Method } from './Method.js';

export class OPTIONS extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    if (
      await this.runPlugins(request, response, 'beginOptions', {
        method: this,
        url,
      })
    ) {
      return;
    }

    const complianceClasses = [
      '1',
      '3',
      ...(await response.locals.adapter.getComplianceClasses(
        url,
        request,
        response,
      )),
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
      ...(await response.locals.adapter.getAllowedMethods(
        url,
        request,
        response,
      )),
    ];
    const cacheControl =
      await response.locals.adapter.getOptionsResponseCacheControl(
        url,
        request,
        response,
      );

    if (
      await this.runPlugins(request, response, 'preOptions', {
        method: this,
        url,
        complianceClasses,
        allowedMethods,
        cacheControl,
      })
    ) {
      return;
    }

    let stream = await this.getBodyStream(request, response);
    let providedBody = false;
    stream.on('data', (data: Buffer) => {
      if (data.toString().trim()) {
        providedBody = true;
      }
    });
    await new Promise<void>((resolve, _reject) => {
      stream.on('end', () => {
        resolve();
      });
    });
    if (providedBody) {
      response.locals.debug('Provided body to OPTIONS.');
      throw new MediaTypeNotSupportedError(
        "This server doesn't understand the body sent in the request.",
      );
    }

    if (
      await this.runPlugins(request, response, 'beforeOptions', {
        method: this,
        url,
        complianceClasses,
        allowedMethods,
        cacheControl,
      })
    ) {
      return;
    }

    response.status(200); // OK
    response.set({
      'Cache-Control': cacheControl,
      Date: new Date().toUTCString(),
      Allow: allowedMethods.join(', '),
      DAV: complianceClasses.join(', '),
      'Content-Length': '0',
    });
    response.end();

    if (
      await this.runPlugins(request, response, 'afterOptions', {
        method: this,
        url,
        complianceClasses,
        allowedMethods,
        cacheControl,
      })
    ) {
      return;
    }
  }
}
