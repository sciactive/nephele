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

export class MOVE extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url, encoding } = this.getRequestData(request, response);

    if (await this.isAdapterRoot(request, response, url)) {
      // Can't move the root of an adapter.
      throw new ForbiddenError('This collection cannot be moved.');
    }

    await this.checkAuthorization(request, response, 'MOVE');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    const destination = this.getRequestDestination(request);
    // According to the spec, the depth header on a MOVE on a collection doesn't
    // matter. The server MUST act as if it's set to "infinity". This is here as
    // a reminder of that fact.
    const _depth = 'infinity';
    const overwrite = request.get('Overwrite');
    const resource = await response.locals.adapter.getResource(
      url,
      response.locals.baseUrl
    );

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
      throw new BadRequestError("Can't move a resource to its own ancestor.");
    }

    const adapter = await this.getAdapter(
      response,
      decodeURI(destination.pathname.substring(request.baseUrl.length))
    );

    // Can't move to another adapter.
    if (adapter !== response.locals.adapter) {
      throw new ForbiddenError(
        'This resource cannot be moved to the destination.'
      );
    }

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

    await this.checkConditionalHeaders(request, response);

    const multiStatus = new MultiStatus();

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    const recursivelyMove = async (
      resource: Resource,
      destination: URL,
      topLevel = true
    ) => {
      const run = catchErrors(
        async () => {
          const adapter = await this.getAdapter(
            response,
            decodeURI(
              destination.pathname.substring(request.baseUrl.length)
            ).replace(/\/?$/, () => '/')
          );

          // Can't move to another adapter.
          if (adapter !== response.locals.adapter) {
            throw new ForbiddenError(
              'This resource cannot be moved to the destination.'
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

          const lockPermission = await this.getLockPermission(
            request,
            response,
            resource,
            response.locals.user
          );

          // Check that the resource wouldn't be removed from a locked collection.
          if (lockPermission === 1) {
            throw new LockedError(
              'The user does not have permission to move a resource from the locked collection.'
            );
          }

          if (lockPermission === 0) {
            throw new LockedError(
              'The user does not have permission to move the locked resource.'
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
                'The user does not have permission to move a resource to the locked collection.'
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
                // expect.
                return;
              }
            }
          }

          if (collection) {
            await resource.copy(
              destination,
              response.locals.baseUrl,
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
                  destination.toString().replace(/\/?$/, () => '/') +
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
              response.locals.baseUrl,
              response.locals.user
            );
          }

          return { existed: destinationExists, result: true };
        },
        async (code, message, error) => {
          if (code === 500 && error) {
            response.locals.debug('Unknown Error: %o', error);
          }

          let status = new Status(destination, code);

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
          'Content-Length': 0,
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
  }
}
