import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  LockedError,
  MediaTypeNotSupportedError,
  NotAcceptableError,
  PreconditionFailedError,
  UnauthorizedError,
} from '../Errors/index.js';
import { catchErrors } from '../catchErrors';
import { MultiStatus, Status } from '../MultiStatus.js';

import { Method } from './Method.js';

export class DELETE extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'DELETE');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    const ifMatch = request.get('If-Match');
    const ifMatchEtags = (ifMatch || '')
      .split(',')
      .map((value) => value.trim().replace(/^["']/, '').replace(/["']$/, ''));
    const ifUnmodifiedSince = request.get('If-Unmodified-Since');
    const resource = await this.adapter.getResource(url, request.baseUrl);

    // According to the spec, any header included with DELETE *MUST* be applied
    // in processing every resource to be deleted.
    const checkConditionalHeaders = async (resource: Resource) => {
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
      if (ifMatch != null && !ifMatchEtags.includes(etag)) {
        throw new PreconditionFailedError('If-Match header check failed.');
      }

      // Check if header for modified date.
      if (
        ifUnmodifiedSince != null &&
        new Date(ifUnmodifiedSince) < lastModified
      ) {
        throw new PreconditionFailedError(
          'If-Unmodified-Since header check failed.'
        );
      }
    };

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    let stream = await this.getBodyStream(request);

    stream.on('data', () => {
      response.locals.debug('Provided body to DELETE.');
      throw new MediaTypeNotSupportedError(
        "This server doesn't understand the body sent in the request."
      );
    });

    await new Promise<void>((resolve, _reject) => {
      stream.on('end', () => {
        resolve();
      });
    });

    if (await resource.isCollection()) {
      const multiStatus = new MultiStatus();

      await this.recursivelyDelete(
        resource,
        request,
        response,
        multiStatus,
        checkConditionalHeaders
      );

      if (multiStatus.statuses.length === 0) {
        await checkConditionalHeaders(resource);
        await resource.delete(response.locals.user);

        response.status(204); // No Content
        response.end();
      } else {
        // If there were errors, don't delete the top level resource, respond
        // with the errors.
        const responseXml = await this.renderXml(multiStatus.render());
        response.status(207); // Multi-Status
        response.set({
          'Content-Type': contentType,
          'Content-Length': responseXml.length,
        });
        response.send(responseXml);
      }
    } else {
      await checkConditionalHeaders(resource);
      await resource.delete(response.locals.user);

      response.status(204); // No Content
      response.end();
    }
  }

  async recursivelyDelete(
    collection: Resource,
    request: Request,
    response: AuthResponse,
    multiStatus: MultiStatus,
    checkConditionalHeaders: (resource: Resource) => Promise<void>
  ): Promise<boolean> {
    try {
      const children = await collection.getInternalMembers(
        response.locals.user
      );

      let allDeleted = true;
      for (let child of children) {
        const run = catchErrors(
          async () => {
            let deleteThisOne = true;
            let locked = false;

            const lockPermission = await this.getLockPermission(
              child,
              response.locals.user,
              // TODO: locks.
              []
            );
            if (lockPermission === 0) {
              throw new LockedError('This resource is locked.');
            } else if (lockPermission === 1) {
              deleteThisOne = false;
              locked = true;
            }

            if (await child.isCollection()) {
              deleteThisOne = await this.recursivelyDelete(
                child,
                request,
                response,
                multiStatus,
                checkConditionalHeaders
              );
              allDeleted = allDeleted && deleteThisOne;
            }

            if (deleteThisOne) {
              await checkConditionalHeaders(child);
              await child.delete(response.locals.user);
            } else if (locked) {
              throw new LockedError('This resource is locked.');
            }
          },
          async (code, message) => {
            const url = (
              await child.getCanonicalUrl(this.getRequestBaseUrl(request))
            ).toString();
            let error = new Status(url, code);

            if (message) {
              error.description = message;
            }

            multiStatus.addStatus(error);

            allDeleted = false;
          }
        );

        await run();
      }

      return allDeleted;
    } catch (e: any) {
      const url = (
        await collection.getCanonicalUrl(this.getRequestBaseUrl(request))
      ).toString();
      let error = new Status(url, 500);
      if (e instanceof UnauthorizedError) {
        error = new Status(url, 401);
      }

      if (e.message) {
        error.description = e.message;
      }
      multiStatus.addStatus(error);

      return false;
    }
  }
}
