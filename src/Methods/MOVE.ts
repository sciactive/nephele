import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  BadRequestError,
  MediaTypeNotSupportedError,
  NotAcceptableError,
  PreconditionFailedError,
  ResourceNotFoundError,
  UnauthorizedError,
} from '../Errors/index.js';
import { catchErrors } from '../catchErrors';
import { MultiStatus, Status } from '../MultiStatus.js';

import { Method } from './Method.js';
import { DELETE } from './DELETE.js';

export class MOVE extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'MOVE');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    const destinationHeader = request.get('Destination');
    // According to the spec, the depth header on a MOVE on a collection doesn't
    // matter. The server MUST act as if it's set to "infinity". This is here as
    // a reminder of that fact.
    const _depth = 'infinity';
    const overwrite = request.get('Overwrite');
    const ifMatch = request.get('If-Match');
    const ifMatchEtags = (ifMatch || '')
      .split(',')
      .map((value) => value.trim().replace(/^["']/, '').replace(/["']$/, ''));
    const ifUnmodifiedSince = request.get('If-Unmodified-Since');
    const resource = await this.adapter.getResource(url, request.baseUrl);

    let destination: URL;
    if (destinationHeader != null) {
      try {
        destination = new URL(destinationHeader);
      } catch (e: any) {
        throw new BadRequestError('Destination header must be a valid URI.');
      }
    } else {
      throw new BadRequestError('Destination header is required.');
    }

    // According to the spec, any header included with MOVE *MUST* be applied
    // in processing every resource to be moved.
    const checkConditionalHeaders = async (
      resource: Resource,
      destinationExists: boolean
    ) => {
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

      // Check overwrite header.
      if (overwrite === 'F' && destinationExists) {
        throw new PreconditionFailedError(
          'A resource exists at the destination.'
        );
      }
    };

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    let stream = await this.getBodyStream(request, response);

    stream.on('data', () => {
      response.locals.debug('Provided body to MOVE.');
      throw new MediaTypeNotSupportedError(
        "This server doesn't understand the body sent in the request."
      );
    });

    await new Promise<void>((resolve, _reject) => {
      stream.on('end', () => {
        resolve();
      });
    });

    const multiStatus = new MultiStatus();

    const recursivelyMove = async (
      resource: Resource,
      destination: URL,
      topLevel = true
    ) => {
      const run = catchErrors(
        async () => {
          let destinationResource: Resource;
          let destinationExists = true;
          try {
            destinationResource = await this.adapter.getResource(
              destination,
              request.baseUrl
            );
          } catch (e: any) {
            if (e instanceof ResourceNotFoundError) {
              destinationResource = await this.adapter.newResource(
                destination,
                request.baseUrl
              );
              destinationExists = false;
            } else {
              throw e;
            }
          }

          await checkConditionalHeaders(resource, destinationExists);

          // Check permissions to write to destination.
          const collection = await resource.isCollection();
          if (
            !(await this.adapter.isAuthorized(
              destination,
              collection ? 'MKCOL' : 'PUT',
              request.baseUrl,
              response.locals.user
            ))
          ) {
            throw new UnauthorizedError(
              'The user is not authorized to modify the destination resource.'
            );
          }

          if (destinationExists) {
            if (topLevel && (await destinationResource.isCollection())) {
              // According to the spec, if the destination is an existing
              // collection, its contents mustn't be merged, but instead,
              // replaced by the source resource. In order to comply, we're just
              // going to delete all the destination's contents.
              const del = new DELETE(this.adapter, this.opts);
              const childrenDeleted = await del.recursivelyDelete(
                destinationResource,
                request,
                response,
                multiStatus,
                async () => {}
              );

              if (childrenDeleted) {
                await destinationResource.delete(response.locals.user);
              }
            } else {
              // If we get here, it either means the resource is locked,
              // undeletable, or contains something that's undeletable.

              const lockPermission = await this.getLockPermission(
                destinationResource,
                response.locals.user,
                // TODO: locks.
                []
              );

              if (lockPermission !== 2) {
                // It is locked, so we can't continue into this resource tree.
                // Technically, a depth "0" lock on a collection only locks the
                // internal members of the collection, not all members, but
                // merging members below its internal members would a. be very
                // complicated, and b. probably not result in what a user would
                // expect.
                return;
              }
            }
          }

          if (collection) {
            await resource.copy(
              destination,
              request.baseUrl,
              response.locals.user
            );

            let allMoved = true;

            try {
              const children = await resource.getInternalMembers(
                response.locals.user
              );

              for (let child of children) {
                const name = await child.getCanonicalName();
                const destinationUrl = new URL(
                  destination.toString().replace(/\/$/, '') +
                    '/' +
                    encodeURIComponent(name)
                );

                const { result } = (await recursivelyMove(
                  child,
                  destinationUrl,
                  false
                )) || { result: false };

                allMoved = allMoved && result;
              }
            } catch (e: any) {
              if (e instanceof UnauthorizedError) {
                // Silently fail to move unlistable members.
                return;
              }

              throw e;
            }

            if (allMoved) {
              await resource.delete(response.locals.user);
            }
          } else {
            await resource.move(
              destination,
              request.baseUrl,
              response.locals.user
            );
          }

          return { existed: destinationExists, result: true };
        },
        async (code, message, error) => {
          if (code === 500 && error) {
            response.locals.debug('Unknown Error: ', error);
          }

          const url = destination.toString();
          let status = new Status(url, code);

          if (message) {
            status.description = message;
          }

          multiStatus.addStatus(status);
        }
      );

      return await run();
    };

    const { existed } = (await recursivelyMove(resource, destination)) || {
      existed: false,
    };

    if (multiStatus.statuses.length === 0) {
      response.status(existed ? 204 : 201); // No Content : Created
      if (!existed) {
        response.set({
          Location: destination.toString(),
        });
      }
      response.end();
    } else {
      const responseXml = await this.renderXml(multiStatus.render());
      response.status(207); // Multi-Status
      response.set({
        'Content-Type': contentType,
        'Content-Length': responseXml.length,
      });
      response.send(responseXml);
    }
  }
}
