import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  ForbiddenError,
  LockedError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
} from '../Errors/index.js';

import { Method } from './Method.js';

export class PUT extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'PUT');

    let resource: Resource;
    let newResource = false;
    try {
      resource = await this.adapter.getResource(url, request.baseUrl);
    } catch (e: any) {
      if (e instanceof ResourceNotFoundError) {
        resource = await this.adapter.newResource(url, request.baseUrl);
        newResource = true;
      } else {
        throw e;
      }
    }

    try {
      const parent = await this.getParentResource(request, resource);
      if (!(await parent?.isCollection())) {
        console.log(parent);
        throw new ForbiddenError('Parent resource is not a collection.');
      }
    } catch (e: any) {
      // Parent not found is handled separately.
      if (e instanceof ResourceNotFoundError) {
        throw new ResourceTreeNotCompleteError(
          'One or more intermediate collections must be created before this resource.'
        );
      } else {
        throw e;
      }
    }

    const lockPermission = await this.getLockPermission(
      request,
      resource,
      response.locals.user
    );

    // Check that the resource wouldn't be added to a locked collection.
    if (newResource && lockPermission === 1) {
      throw new LockedError(
        'The user does not have permission to add a new resource to the locked collection.'
      );
    }

    if (lockPermission === 0) {
      throw new LockedError(
        `The user does not have permission to ${
          newResource ? 'create' : 'modify'
        } the locked resource.`
      );
    }

    await this.checkConditionalHeaders(request, response);

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    const contentLanguage = request.get('Content-Language');
    let stream = await this.getBodyStream(request, response);
    await resource.setStream(stream, response.locals.user);

    response.status(newResource ? 201 : 204); // Created or No Content
    if (newResource) {
      response.set({
        Location: (
          await resource.getCanonicalUrl(this.getRequestBaseUrl(request))
        ).toString(),
      });
    }
    response.end();

    if (contentLanguage && contentLanguage !== '') {
      try {
        const properties = await resource.getProperties();
        await properties.set('getcontentlanguage', contentLanguage);
      } catch (e: any) {
        // Ignore errors here.
      }
    }
  }
}
