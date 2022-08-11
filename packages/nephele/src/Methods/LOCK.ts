import type { Request } from 'express';
import { v4 as uuid } from 'uuid';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  BadRequestError,
  LockedError,
  NotAcceptableError,
  ResourceNotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../Errors/index.js';
import { catchErrors } from '../catchErrors.js';
import { MultiStatus, Status } from '../MultiStatus.js';

import { Method } from './Method.js';

export class LOCK extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url, encoding } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'LOCK');

    const depth: '0' | 'infinity' = (request.get('Depth') || 'infinity') as
      | '0'
      | 'infinity';
    const timeoutHeader = request.get('Timeout') || 'Infinite';
    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }
    let resource: Resource;
    let newResource = false;
    try {
      resource = await response.locals.adapter.getResource(
        url,
        response.locals.baseUrl
      );
    } catch (e: any) {
      if (e instanceof ResourceNotFoundError) {
        resource = await response.locals.adapter.newResource(
          url,
          response.locals.baseUrl
        );
        newResource = true;
      } else {
        throw e;
      }
    }

    const timeoutRequests = timeoutHeader.split(/,\s+/);
    let timeout = Infinity;
    for (let curTreq of timeoutRequests) {
      let tReqSec: number;
      if (curTreq === 'Infinite') {
        tReqSec = Infinity;
      } else if (curTreq.startsWith('Second-')) {
        tReqSec = parseInt(curTreq.substring('Second-'.length));
      } else {
        tReqSec = NaN;
      }

      if (isNaN(tReqSec)) {
        throw new BadRequestError(
          'Timeout header must contain only valid timeouts.'
        );
      }

      if (
        tReqSec * 1000 <= this.opts.maxLockTimeout &&
        tReqSec * 1000 >= this.opts.minLockTimeout
      ) {
        timeout = tReqSec * 1000;
        break;
      }
    }

    if (timeout > this.opts.maxLockTimeout) {
      timeout = this.opts.maxLockTimeout;
    } else if (timeout < this.opts.minLockTimeout) {
      timeout = this.opts.minLockTimeout;
    }

    const xmlBody = await this.getBodyXML(request, response);

    if (xmlBody == null) {
      // If the body is empty, it means the user is trying to refresh a lock.

      const lockTokens = this.getRequestLockTockens(request);
      if (lockTokens.length !== 1) {
        throw new BadRequestError(
          'LOCK method for refreshing a lock must include exactly one lock token in the If header.'
        );
      }

      const token = lockTokens[0];
      const locks = await this.getLocksByUser(
        request,
        response,
        resource,
        response.locals.user
      );

      const lock =
        locks.resource.find((lock) => lock.token === token) ||
        locks.depthInfinity.find((lock) => lock.token === token);

      if (lock == null) {
        const multiStatus = new MultiStatus();

        let status = new Status(url, 412); // Precondition Failed
        status.setBody({ error: [{ 'lock-token-matches-request-uri': {} }] });
        multiStatus.addStatus(status);

        const responseXml = await this.renderXml(multiStatus.render());
        response.status(207); // Multi-Status
        response.set({
          'Content-Type': `${contentType}; charset=utf-8`,
        });
        this.sendBodyContent(response, responseXml, encoding);
        return;
      }

      await this.checkConditionalHeaders(request, response);

      lock.date = new Date();
      lock.timeout = timeout;

      await lock.save();

      // Lock returned only in response body. Why? The spec says so.
      const currentLocks = await this.getLocks(request, response, resource);
      const responseObj = {
        prop: {
          lockdiscovery: await this.formatLocks(currentLocks.all),
        },
      };
      const responseXml = await this.renderXml(responseObj);
      response.status(200); // OK
      response.set({
        'Content-Type': `${contentType}; charset=utf-8`,
      });
      this.sendBodyContent(response, responseXml, encoding);

      return;
    }

    // Check depth header after empty body check, because it must be ignored on
    // LOCK refresh requests.
    if (!['0', 'infinity'].includes(depth)) {
      throw new BadRequestError(
        'Depth header, if present must be one of "0", or "infinity".'
      );
    }

    const { output: xml, prefixes } = await this.parseXml(xmlBody);

    if (xml == null) {
      throw new BadRequestError(
        'The given body was not understood by the server.'
      );
    }

    if (!('lockinfo' in xml)) {
      throw new BadRequestError('LOCK methods requires a lockinfo element.');
    }

    if (!('lockscope' in xml.lockinfo) || !xml.lockinfo.lockscope.length) {
      throw new BadRequestError('LOCK methods requires a lockscope element.');
    }

    const lockscopeXml = xml.lockinfo.lockscope[0];

    if (!('locktype' in xml.lockinfo) || !xml.lockinfo.locktype.length) {
      throw new BadRequestError('LOCK methods requires a locktype element.');
    }

    const locktypeXml = xml.lockinfo.locktype[0];

    if (
      !('owner' in xml.lockinfo) ||
      !xml.lockinfo.owner.length ||
      Object.keys(xml.lockinfo.owner[0]).length === 0
    ) {
      throw new BadRequestError('LOCK method requires a filled owner element.');
    }

    const owner = xml.lockinfo.owner[0];

    if (!('write' in locktypeXml)) {
      throw new BadRequestError('This server only supports write locks.');
    }

    if (!('exclusive' in lockscopeXml) && !('shared' in lockscopeXml)) {
      throw new BadRequestError(
        'This server only supports exclusive and shared locks.'
      );
    }

    const scope: 'exclusive' | 'shared' =
      'exclusive' in lockscopeXml ? 'exclusive' : 'shared';

    const checkForLockAbove = async () => {
      const lockPermission = await this.getLockPermission(
        request,
        response,
        resource,
        response.locals.user
      );

      // Check that the resource wouldn't be added to a locked collection.
      if (newResource && lockPermission === 1) {
        throw new LockedError(
          'The user does not have permission to create an empty resource in the locked collection.'
        );
      }

      if (lockPermission === 0) {
        throw new LockedError(
          `The user does not have permission to ${
            newResource ? 'create' : 'lock'
          } the locked resource.`
        );
      }

      if (lockPermission === 3 && scope === 'exclusive') {
        throw new LockedError(
          `The user does not have permission to ${
            newResource ? 'create' : 'lock'
          } the locked resource with an exclusive lock.`
        );
      }
    };

    await new Promise<void>(async (resolve, reject) => {
      let attempt = 0;

      const runLockAndProvisionalCheck = async () => {
        await checkForLockAbove();

        // Check for provisional locks that are blocking this one.
        const provisionalLocks = await this.getProvisionalLocks(
          request,
          response,
          resource
        );

        if (provisionalLocks.all.length) {
          if (attempt >= 120) {
            // Give up after a while. (Max ~60 seconds.)
            throw new ServiceUnavailableError(
              'The server is waiting for another lock operation to complete.'
            );
          }

          // A provisional lock exists, so wait for between 100 and 500 ms to
          // try again.
          await new Promise((resolve) =>
            setTimeout(resolve, 100 + Math.random() * 400)
          );

          attempt++;
          await runLockAndProvisionalCheck();
        }
      };

      try {
        await runLockAndProvisionalCheck();
        resolve();
      } catch (e: any) {
        reject(e);
      }
    });

    await this.checkConditionalHeaders(request, response);

    const multiStatus = new MultiStatus();

    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });

    // Create a provisional lock.
    const lock = await resource.createLockForUser(response.locals.user);
    lock.token = `urn:uuid:${uuid()}`;
    lock.date = new Date();
    // Timeout the provisional lock after five minutes.
    lock.timeout = 1000 * 60 * 5;
    lock.scope = scope;
    lock.depth = depth;
    lock.owner = owner;
    lock.provisional = true;

    await lock.save();

    // Now that we have a provisional lock, check upward again.
    try {
      await checkForLockAbove();
    } catch (e: any) {
      await lock.delete();
      throw e;
    }

    const checkForPermissionAndLocksBelow = async (
      resource: Resource,
      firstLevel = true
    ) => {
      // If the resource is the root of another adapter, we need its copy of the
      // resource in order to continue looking for locks below.
      const resourceUrl = await resource.getCanonicalUrl();
      if (await this.isAdapterRoot(request, response, resourceUrl)) {
        const absoluteUrl = new URL(
          resourceUrl.toString().replace(/\/?$/, () => '/')
        );
        const adapter = await this.getAdapter(
          response,
          decodeURI(resourceUrl.pathname.substring(request.baseUrl.length))
        );
        resource = await adapter.getResource(absoluteUrl, absoluteUrl);
      }

      // Check permissions to lock the resource.
      if (
        // Use the resource's adapter and baseUrl, because this could be on
        // another adapter than the request.
        !(await resource.adapter.isAuthorized(
          await resource.getCanonicalUrl(),
          'LOCK',
          resource.baseUrl,
          response.locals.user
        ))
      ) {
        throw new UnauthorizedError(
          'The user is not authorized to lock the resource.'
        );
      }

      const locks = await resource.getLocks();

      if (locks.length) {
        if (lock.scope === 'exclusive') {
          throw new LockedError('Cannot create a conflicting lock.');
        }

        for (let checkLock of locks) {
          if (checkLock.scope === 'exclusive') {
            throw new LockedError('Cannot create a conflicting lock.');
          }
        }
      }

      if (
        (await resource.isCollection()) &&
        ((lock.depth === '0' && firstLevel) || lock.depth === 'infinity')
      ) {
        const children = await resource.getInternalMembers(
          response.locals.user
        );

        for (let child of children) {
          const run = catchErrors(
            async () => {
              if (!multiStatus.statuses.length) {
                await checkForPermissionAndLocksBelow(child);
              }
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
                status.setBody({ error: [{ 'no-conflicting-lock': {} }] });
              }

              multiStatus.addStatus(status);
            }
          );

          await run();
        }
      }
    };

    // And check below for any conflicting lock.
    const run = catchErrors(
      async () => {
        await checkForPermissionAndLocksBelow(resource);
      },
      async (code, message, error) => {
        if (code === 500 && error) {
          response.locals.debug('Unknown Error: %o', error);
        }

        const url = await resource.getCanonicalUrl();
        let status = new Status(url, code);

        if (message) {
          status.description = message;
        }

        if (error instanceof LockedError) {
          status.setBody({ error: [{ 'no-conflicting-lock': {} }] });
        }

        multiStatus.addStatus(status);
      }
    );

    await run();

    if (multiStatus.statuses.length) {
      await lock.delete();

      let status = new Status(url, 424); // Failed Dependency
      multiStatus.addStatus(status);

      const responseXml = await this.renderXml(multiStatus.render(), prefixes);
      response.status(207); // Multi-Status
      response.set({
        'Content-Type': `${contentType}; charset=utf-8`,
      });
      this.sendBodyContent(response, responseXml, encoding);
    }

    // There's no conflicting lock below this one, so continue on.

    // Create an empty resource if it's new.
    if (newResource) {
      try {
        await resource.create(response.locals.user);
      } catch (e: any) {
        await lock.delete();
        throw e;
      }
    }

    // Set provisional lock to real lock.
    lock.date = new Date();
    lock.timeout = timeout;
    lock.provisional = false;
    await lock.save();

    // Lock returned in Lock-Token header and response body.
    const currentLocks = await this.getLocks(request, response, resource);
    const responseObj = {
      prop: {
        lockdiscovery: await this.formatLocks(currentLocks.all),
      },
    };
    const responseXml = await this.renderXml(responseObj, prefixes);
    response.status(newResource ? 201 : 200); // Created or OK
    response.set({
      'Lock-Token': `<${lock.token}>`,
      'Content-Type': `${contentType}; charset=utf-8`,
    });
    this.sendBodyContent(response, responseXml, encoding);
  }
}
