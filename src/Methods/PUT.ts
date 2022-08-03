import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  BadRequestError,
  LockedError,
  PreconditionFailedError,
  ResourceNotFoundError,
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

    if (newResource) {
      // Check if header for etag.
      const ifMatch = request.get('If-Match');

      // It's a new resource, so any etag should fail.
      if (ifMatch != null) {
        throw new PreconditionFailedError('If-Match header check failed.');
      }

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
    } else {
      const properties = await resource.getProperties();
      const etagPromise = resource.getEtag();
      const lastModifiedPromise = properties.get('getlastmodified');
      const [etag, lastModifiedString] = [
        await etagPromise,
        await lastModifiedPromise,
      ];
      if (typeof lastModifiedString !== 'string') {
        throw new Error('Last modified date property is not a string.');
      }
      const lastModified = new Date(lastModifiedString);

      // Check if header for etag.
      const ifMatch = request.get('If-Match');
      const ifMatchEtags = (ifMatch || '')
        .split(',')
        .map((value) => value.trim().replace(/^["']/, '').replace(/["']$/, ''));
      if (ifMatch != null && !ifMatchEtags.includes(etag)) {
        throw new PreconditionFailedError('If-Match header check failed.');
      }

      // Check if header for modified date.
      const ifUnmodifiedSince = request.get('If-Unmodified-Since');
      if (
        ifUnmodifiedSince != null &&
        new Date(ifUnmodifiedSince) < lastModified
      ) {
        throw new PreconditionFailedError(
          'If-Unmodified-Since header check failed.'
        );
      }

      // TODO: This seems to cause issues with existing clients.
      // if (ifMatch == null && ifUnmodifiedSince == null) {
      //   // Require that PUT for an existing resource is conditional.
      //   // 428 Precondition Required
      //   throw new PreconditionRequiredError(
      //     'Overwriting existing resource requires the use of a conditional header, If-Match or If-Unmodified-Since.'
      //   );
      // }

      const lockPermission = await this.getLockPermission(
        request,
        resource,
        response.locals.user
      );

      if (lockPermission === 0) {
        throw new LockedError(
          'The user does not have permission to modify the locked resource.'
        );
      }
    }

    const ifNoneMatch = request.get('If-None-Match');
    if (ifNoneMatch != null) {
      if (ifNoneMatch.trim() === '*') {
        if (!newResource) {
          throw new PreconditionFailedError(
            'If-None-Match header check failed.'
          );
        }
      } else {
        throw new BadRequestError(
          'If-None-Match, if provided, must be "*" on a PUT request.'
        );
      }
    }

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    const contentLanguage = request.get('Content-Language');
    let stream = await this.getBodyStream(request, response);
    await resource.setStream(stream, response.locals.user);

    response.status(newResource ? 201 : 204); // Created or No Content
    response.set({
      'Content-Location': (
        await resource.getCanonicalUrl(this.getRequestBaseUrl(request))
      ).pathname,
    });
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
