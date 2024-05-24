import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  BadRequestError,
  ForbiddenError,
  LockedError,
  MediaTypeNotSupportedError,
  NotAcceptableError,
  PreconditionFailedError,
  ResourceNotFoundError,
  UnauthorizedError,
} from '../Errors/index.js';
import { catchErrors } from '../catchErrors.js';
import { MultiStatus, Status } from '../MultiStatus.js';

import { Method } from './Method.js';
import { DELETE } from './DELETE.js';

export class COPY extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url, encoding } = this.getRequestData(request, response);

    if (
      await this.runPlugins(request, response, 'beginCopy', {
        method: this,
        url,
      })
    ) {
      return;
    }

    if (await this.isAdapterRoot(request, response, url)) {
      // Can't copy the root of an adapter.
      throw new ForbiddenError('This collection cannot be copied.');
    }

    await this.checkAuthorization(request, response, 'COPY');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    let destination = this.getRequestDestination(request);
    const depth = request.get('Depth') || 'infinity';
    const overwrite = request.get('Overwrite');
    const resource = await response.locals.adapter.getResource(
      url,
      response.locals.baseUrl
    );

    if ((await resource.isCollection()) && !url.toString().endsWith('/')) {
      response.set({
        'Content-Location': `${url}/`,
      });
    }

    if (
      await this.runPlugins(request, response, 'preCopy', {
        method: this,
        resource,
        destination,
        depth,
        overwrite,
      })
    ) {
      return;
    }

    if (!destination) {
      throw new BadRequestError('Destination header is required.');
    }

    if (
      url
        .toString()
        .startsWith(destination.toString().replace(/\/?$/, () => '/'))
    ) {
      // Technically, there's nothing in the spec that says you can't do this,
      // but logically, it's impossible, since the spec says to recursively
      // delete everything at the destination first.
      throw new BadRequestError("Can't copy a resource to its own ancestor.");
    }

    // Check that the adapter at the destination is the same as the adapter at
    // the source. Can't copy to another adapter.
    if (
      !(await this.pathsHaveSameAdapter(
        response,
        decodeURIComponent(request.path),
        decodeURIComponent(
          destination.pathname.substring(request.baseUrl.length)
        )
      ))
    ) {
      throw new ForbiddenError(
        'This resource cannot be copied to the destination.'
      );
    }

    if (await resource.isCollection()) {
      destination = new URL(destination.toString().replace(/\/?$/, () => '/'));
    }

    if (!['0', 'infinity'].includes(depth)) {
      throw new BadRequestError(
        'Depth header must be one of "0", or "infinity".'
      );
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
      response.locals.debug('Provided body to COPY.');
      throw new MediaTypeNotSupportedError(
        "This server doesn't understand the body sent in the request."
      );
    }

    await this.checkConditionalHeaders(request, response);

    let destResource: Resource;
    let destExists = true;
    try {
      destResource = await response.locals.adapter.getResource(
        destination,
        response.locals.baseUrl
      );
    } catch (e: any) {
      if (e instanceof ResourceNotFoundError) {
        destResource = await response.locals.adapter.newResource(
          destination,
          response.locals.baseUrl
        );
        destExists = false;
      } else {
        throw e;
      }
    }

    if (
      await this.runPlugins(request, response, 'beforeCopy', {
        method: this,
        resource,
        destination: destResource,
        exists: destExists,
        depth,
        overwrite,
      })
    ) {
      return;
    }

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    const multiStatus = new MultiStatus();

    const recursivelyCopy = async (
      resource: Resource,
      destination: URL,
      topLevel = true
    ) => {
      const run = catchErrors(
        async () => {
          // Can't copy to another adapter.
          if (
            !(await this.pathsHaveSameAdapter(
              response,
              decodeURIComponent(
                (
                  await resource.getCanonicalUrl()
                ).pathname.substring(request.baseUrl.length)
              ),
              decodeURIComponent(
                destination.pathname.substring(request.baseUrl.length)
              ).replace(/\/?$/, () => '/')
            ))
          ) {
            throw new ForbiddenError(
              'This resource cannot be copied to the destination.'
            );
          }

          let destinationResource: Resource;
          let destinationExists = true;
          try {
            destinationResource = await response.locals.adapter.getResource(
              destination,
              response.locals.baseUrl
            );
          } catch (e: any) {
            if (e instanceof ResourceNotFoundError) {
              destinationResource = await response.locals.adapter.newResource(
                destination,
                response.locals.baseUrl
              );
              destinationExists = false;
            } else {
              throw e;
            }
          }

          // Check overwrite header.
          if (overwrite === 'F' && destinationExists) {
            throw new PreconditionFailedError(
              'A resource exists at the destination.'
            );
          }

          // Check permissions to write to destination.
          const collection = await resource.isCollection();
          if (
            !(await response.locals.adapter.isAuthorized(
              destination,
              collection ? 'MKCOL' : 'PUT',
              response.locals.baseUrl,
              response.locals.user
            ))
          ) {
            throw new UnauthorizedError(
              'The user is not authorized to modify the destination resource.'
            );
          }

          if (topLevel) {
            const lockPermission = await this.getLockPermission(
              request,
              response,
              destinationResource,
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
                'The user does not have permission to modify the locked resource.'
              );
            }
          }

          if (destinationExists) {
            if (topLevel && (await destinationResource.isCollection())) {
              // According to the spec, if the destination is an existing
              // collection, its contents mustn't be merged, but instead,
              // replaced by the source resource. In order to comply, we're just
              // going to delete all the destination's contents.
              const del = new DELETE(this.opts);
              const childrenDeleted = await del.recursivelyDelete(
                destinationResource,
                request,
                response,
                multiStatus
              );

              if (childrenDeleted) {
                await destinationResource.delete(response.locals.user);
              }
            } else {
              // If we get here, it either means the resource is locked,
              // undeletable, or contains something that's undeletable.

              const lockPermission = await this.getLockPermission(
                request,
                response,
                destinationResource,
                response.locals.user
              );

              if (lockPermission !== 2) {
                // It is locked, so we can't continue into this resource tree.
                // Technically, a depth "0" lock on a collection only locks the
                // internal members of the collection, not all members, but
                // merging members below its internal members would a. be very
                // complicated, and b. probably not result in what a user would
                // expect or want.
                return;
              }
            }
          }

          await resource.copy(
            destination,
            response.locals.baseUrl,
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
                  destination.toString().replace(/\/?$/, () => '/') +
                    encodeURIComponent(name) +
                    ((await child.isCollection()) ? '/' : ''),
                  `${destination.protocol}://${destination.host}`
                );

                await recursivelyCopy(child, destinationUrl, false);
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
        async (code, message, error) => {
          if (code === 500 && error) {
            response.locals.debug('Unknown Error: %o', error);
          }

          let status = new Status(destination, code);

          if (message) {
            status.description = message;
          }

          response.locals.errors.push(status);
          multiStatus.addStatus(status);
        }
      );

      return await run();
    };

    const existed = await recursivelyCopy(resource, destination);

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
        'Content-Type': `${contentType}; charset=utf-8`,
      });
      this.sendBodyContent(response, responseXml, encoding);
    }

    await this.runPlugins(request, response, 'afterCopy', {
      method: this,
      resource,
      destination: destResource,
      exists: destExists,
      depth,
      overwrite,
    });
  }
}
