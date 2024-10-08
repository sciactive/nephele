import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';
import {
  ForbiddenError,
  LockedError,
  MediaTypeNotSupportedError,
  ResourceExistsError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
} from '../Errors/index.js';

import { Method } from './Method.js';

export class MKCOL extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    if (
      await this.runPlugins(request, response, 'beginMkcol', {
        method: this,
        url,
      })
    ) {
      return;
    }

    await this.checkAuthorization(request, response, 'MKCOL');

    const resource = await response.locals.adapter.newCollection(
      url,
      response.locals.baseUrl,
    );

    if (!url.toString().endsWith('/')) {
      response.set({
        'Content-Location': `${url}/`,
      });
    }

    if (
      await this.runPlugins(request, response, 'preMkcol', {
        method: this,
        resource,
      })
    ) {
      return;
    }

    try {
      const parent = await this.getParentResource(request, response, resource);
      if (!(await parent?.isCollection())) {
        throw new ForbiddenError('Parent resource is not a collection.');
      }
    } catch (e: any) {
      // Parent not found is handled separately.
      if (e instanceof ResourceNotFoundError) {
        throw new ResourceTreeNotCompleteError(
          'One or more intermediate collections must be created before this resource.',
        );
      } else {
        throw e;
      }
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
      response.locals.debug('Provided body to MKCOL.');
      throw new MediaTypeNotSupportedError(
        "This server doesn't understand the body sent in the request.",
      );
    }

    const lockPermission = await this.getLockPermission(
      request,
      response,
      resource,
      response.locals.user,
    );

    // Check that the resource wouldn't be added to a locked collection.
    if (lockPermission === 1) {
      throw new LockedError(
        'The user does not have permission to add a new resource to the locked collection.',
      );
    }

    if (lockPermission === 0) {
      throw new LockedError(
        'The user does not have permission to create the locked resource.',
      );
    }

    await this.checkConditionalHeaders(request, response);

    if (
      await this.runPlugins(request, response, 'beforeMkcol', {
        method: this,
        resource,
      })
    ) {
      return;
    }

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    try {
      await resource.create(response.locals.user);
    } catch (e: any) {
      if (e instanceof ResourceExistsError) {
        response.removeHeader('Content-Location');
      }
      throw e;
    }

    response.status(201); // Created
    response.set({
      Location: (await resource.getCanonicalUrl()).toString(),
    });
    response.end();

    await this.runPlugins(request, response, 'afterMkcol', {
      method: this,
      resource,
    });
  }
}
