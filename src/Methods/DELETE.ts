import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  ForbiddenError,
  LockedError,
  MediaTypeNotSupportedError,
  NotAcceptableError,
  PreconditionFailedError,
  ResourceNotFoundError,
  UnauthorizedError,
} from '../Errors/index.js';
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

    let resource = await this.adapter.getResource(url, request, response);

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
      const ifMatch = request.get('If-Match');
      if (ifMatch != null) {
        const ifMatchEtags = ifMatch
          .split(',')
          .map((value) =>
            value.trim().replace(/^["']/, '').replace(/["']$/, '')
          );
        if (ifMatchEtags.indexOf(etag) === -1) {
          throw new PreconditionFailedError('If-Match header check failed.');
        }
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

      const recursivelyDelete = async (
        collection: Resource
      ): Promise<boolean> => {
        try {
          const children = await collection.getInternalMembers(
            response.locals.user
          );

          let allDeleted = true;
          for (let child of children) {
            try {
              let deleteThisOne = true;
              if (await child.isCollection()) {
                deleteThisOne = await recursivelyDelete(child);
                allDeleted = allDeleted && deleteThisOne;
              }

              if (deleteThisOne) {
                await checkConditionalHeaders(child);
                await child.delete(response.locals.user);
              }
            } catch (e: any) {
              const url = (await child.getCanonicalUrl()).toString();
              if (e instanceof UnauthorizedError) {
                const error = new Status(url, 401);
                error.description =
                  'The user is not authorized to delete this resource.';
                multiStatus.addStatus(error);
              } else if (e instanceof ForbiddenError) {
                const error = new Status(url, 403);
                error.description = 'This resource cannot be deleted.';
                multiStatus.addStatus(error);
              } else if (e instanceof LockedError) {
                const error = new Status(url, 423);
                error.description = 'This resource is locked.';
                multiStatus.addStatus(error);
              } else if (e instanceof ResourceNotFoundError) {
                const error = new Status(url, 404);
                error.description = 'The resource could not be found.';
                multiStatus.addStatus(error);
              } else {
                const error = new Status(url, 500);
                error.description =
                  'An error occurred while attempting to delete this resource.';
                multiStatus.addStatus(error);
              }

              allDeleted = false;
            }
          }

          return allDeleted;
        } catch (e: any) {
          const url = (await collection.getCanonicalUrl()).toString();
          if (e instanceof UnauthorizedError) {
            const error = new Status(url, 401);
            error.description =
              "The user is not authorized to list this resource's members.";
            multiStatus.addStatus(error);
          } else {
            const error = new Status(url, 500);
            error.description =
              'An error occurred while attempting to delete this resource.';
            multiStatus.addStatus(error);
          }

          return false;
        }
      };

      await recursivelyDelete(resource);

      if (multiStatus.statuses.length === 0) {
        await checkConditionalHeaders(resource);
        await resource.delete(response.locals.user);

        response.status(204); // No Content
        response.end();
      } else {
        const responseXml = await this.renderXml(multiStatus.render());
        response.status(207); // Multi-Status
        response.set({
          'Content-Type': contentType,
          'Content-Length': responseXml.length,
        });
        console.log(responseXml);
        response.send(responseXml);
      }
    } else {
      await checkConditionalHeaders(resource);
      await resource.delete(response.locals.user);

      response.status(204); // No Content
      response.end();
    }
  }
}
