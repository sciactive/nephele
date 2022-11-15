import path from 'node:path';
import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  ForbiddenError,
  LockedError,
  MediaTypeNotSupportedError,
  NotAcceptableError,
  UnauthorizedError,
} from '../Errors/index.js';
import { catchErrors } from '../catchErrors.js';
import { MultiStatus, Status } from '../MultiStatus.js';

import { Method } from './Method.js';

export class DELETE extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url, encoding } = this.getRequestData(request, response);

    if (await this.isAdapterRoot(request, response, url)) {
      // Can't delete the root of an adapter.
      throw new ForbiddenError('This collection cannot be deleted.');
    }

    await this.checkAuthorization(request, response, 'DELETE');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    const resource = await response.locals.adapter.getResource(
      url,
      response.locals.baseUrl
    );

    if (
      await this.runPlugins(request, response, 'preDelete', {
        method: this,
        resource,
      })
    ) {
      return;
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
      response.locals.debug('Provided body to DELETE.');
      throw new MediaTypeNotSupportedError(
        "This server doesn't understand the body sent in the request."
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
        'The user does not have permission to remove a resource from the locked collection.'
      );
    }

    if (lockPermission === 0) {
      throw new LockedError(
        'The user does not have permission to delete the locked resource.'
      );
    }

    await this.checkConditionalHeaders(request, response);

    if (
      await this.runPlugins(request, response, 'beforeDelete', {
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

    if (await resource.isCollection()) {
      const multiStatus = new MultiStatus();

      await this.recursivelyDelete(resource, request, response, multiStatus);

      if (multiStatus.statuses.length === 0) {
        // Delete its locks.
        const locks = await this.getCurrentResourceLocks(resource);
        for (let lock of locks) {
          await lock.delete();
        }

        await resource.delete(response.locals.user);

        response.status(204); // No Content
        response.end();
      } else {
        // If there were errors, don't delete the top level resource, respond
        // with the errors.
        const responseXml = await this.renderXml(multiStatus.render());
        response.status(207); // Multi-Status
        response.set({
          'Content-Type': `${contentType}; charset=utf-8`,
        });
        this.sendBodyContent(response, responseXml, encoding);
      }
    } else {
      // Delete its locks.
      const locks = await this.getCurrentResourceLocks(resource);
      for (let lock of locks) {
        await lock.delete();
      }

      await resource.delete(response.locals.user);

      response.status(204); // No Content
      response.end();
    }

    await this.runPlugins(request, response, 'afterDelete', {
      method: this,
      resource,
    });
  }

  async recursivelyDelete(
    collection: Resource,
    request: Request,
    response: AuthResponse,
    multiStatus: MultiStatus
  ): Promise<boolean> {
    try {
      const children = await collection.getInternalMembers(
        response.locals.user
      );

      let allDeleted = true;
      for (let child of children) {
        const run = catchErrors(
          async () => {
            if (
              await this.isAdapterRoot(
                request,
                response,
                await child.getCanonicalUrl()
              )
            ) {
              // Can't delete the root of another adapter.
              throw new ForbiddenError('This collection cannot be deleted.');
            }

            const lockPermission = await this.getLockPermission(
              request,
              response,
              child,
              response.locals.user
            );
            if (lockPermission !== 2) {
              throw new LockedError('This resource is locked.');
            }

            if (await child.isCollection()) {
              allDeleted =
                allDeleted &&
                (await this.recursivelyDelete(
                  child,
                  request,
                  response,
                  multiStatus
                ));
            }

            // Delete its locks.
            const locks = await this.getCurrentResourceLocks(child);
            for (let lock of locks) {
              await lock.delete();
            }

            await child.delete(response.locals.user);
          },
          async (code, message, error) => {
            if (code === 500 && error) {
              response.locals.debug('Unknown Error: %o', error);
            }

            const url = await child.getCanonicalUrl();
            let status = new Status(url, code);

            if (message) {
              status.description = message;
            }

            if (error instanceof LockedError) {
              status.setBody({ error: [{ 'lock-token-submitted': {} }] });
            }

            multiStatus.addStatus(status);

            allDeleted = false;
          }
        );

        await run();
      }

      return allDeleted;
    } catch (e: any) {
      const url = await collection.getCanonicalUrl();
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
