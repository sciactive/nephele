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

    if (
      await this.runPlugins(request, response, 'beginPut', {
        method: this,
        url,
      })
    ) {
      return;
    }

    await this.checkAuthorization(request, response, 'PUT');

    let resource: Resource;
    let newResource = false;
    try {
      resource = await response.locals.adapter.getResource(
        url,
        response.locals.baseUrl,
      );
    } catch (e: any) {
      if (e instanceof ResourceNotFoundError) {
        resource = await response.locals.adapter.newResource(
          url,
          response.locals.baseUrl,
        );
        newResource = true;
      } else {
        throw e;
      }
    }

    if ((await resource.isCollection()) && !url.toString().endsWith('/')) {
      response.set({
        'Content-Location': `${url}/`,
      });
    }

    if (
      await this.runPlugins(request, response, 'prePut', {
        method: this,
        resource,
        newResource,
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

    const lockPermission = await this.getLockPermission(
      request,
      response,
      resource,
      response.locals.user,
    );

    // Check that the resource wouldn't be added to a locked collection.
    if (newResource && lockPermission === 1) {
      throw new LockedError(
        'The user does not have permission to add a new resource to the locked collection.',
      );
    }

    if (lockPermission === 0) {
      throw new LockedError(
        `The user does not have permission to ${
          newResource ? 'create' : 'modify'
        } the locked resource.`,
      );
    }

    await this.checkConditionalHeaders(request, response);

    if (
      await this.runPlugins(request, response, 'beforePut', {
        method: this,
        resource,
        newResource,
      })
    ) {
      return;
    }

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    const contentLanguage = request.get('Content-Language');
    let contentType = request.get('Content-Type');
    if (contentType) {
      contentType = contentType && contentType.split(';')[0];
      if (
        !contentType.match(
          /(application|audio|font|example|image|message|model|multipart|text|video|X-[a-zA-Z0-9_-+.]+)\/[a-zA-Z0-9][a-zA-Z0-9_-+.]*/,
        )
      ) {
        contentType = undefined;
      }
    }

    let stream = await this.getBodyStream(request, response);
    await resource.setStream(stream, response.locals.user, contentType);

    response.status(newResource ? 201 : 204); // Created or No Content
    if (newResource) {
      response.set({
        Location: (await resource.getCanonicalUrl()).toString(),
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

    await this.runPlugins(request, response, 'afterPut', {
      method: this,
      resource,
      newResource,
    });
  }
}
