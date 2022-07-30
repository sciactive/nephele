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

export class COPY extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'COPY');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    const destinationHeader = request.get('Destination');
    const depth = request.get('Depth') || 'infinity';
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

    if (!['0', 'infinity'].includes(depth)) {
      throw new BadRequestError(
        'Depth header must be one of "0", or "infinity".'
      );
    }

    // According to the spec, any header included with COPY *MUST* be applied
    // in processing every resource to be deleted.
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

    let stream = await this.getBodyStream(request);

    stream.on('data', () => {
      response.locals.debug('Provided body to COPY.');
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

    const recursivelyCopy = async (resource: Resource, destination: URL) => {
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

          if (destinationExists && (await destinationResource.isCollection())) {
            // According to the spec, if the destination is an existing
            // collection, its contents mustn't be merged, but instead, replaced
            // by the source resource. In order to comply, we're just going to
            // delete all the destination's contents.
            // TODO: delete all contents.
          }

          await resource.copy(
            destination,
            request.baseUrl,
            response.locals.user
          );

          if (depth === 'infinity' && collection) {
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

                await recursivelyCopy(child, destinationUrl);
              }
            } catch (e: any) {
              if (e instanceof UnauthorizedError) {
                // Silently fail to copy unlistable members.
                return;
              }

              throw e;
            }
          }

          return destinationExists;
        },
        async (code, message) => {
          const url = destination.toString();
          let error = new Status(url, code);

          if (message) {
            error.description = message;
          }

          multiStatus.addStatus(error);
        }
      );

      return await run();
    };

    const existed = await recursivelyCopy(resource, destination);

    if (multiStatus.statuses.length === 0) {
      response.status(existed ? 204 : 201); // No Content : Created
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
