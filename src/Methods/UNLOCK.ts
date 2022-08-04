import type { Request } from 'express';

import type { AuthResponse } from '../Interfaces/index.js';
import {
  BadRequestError,
  ForbiddenError,
  NotAcceptableError,
} from '../Errors/index.js';
import { MultiStatus, Status } from '../MultiStatus.js';

import { Method } from './Method.js';

export class UNLOCK extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url, encoding } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'UNLOCK');

    const lockTokenHeader = request.get('Lock-Token');
    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }
    let resource = await this.adapter.getResource(url, request.baseUrl);

    if (lockTokenHeader == null || lockTokenHeader.trim() === '') {
      throw new BadRequestError(
        'UNLOCK method must include a lock token in the Lock-Token header.'
      );
    }

    const token = lockTokenHeader.trim().slice(1, -1);
    const locks = await this.getLocksByUser(
      request,
      resource,
      response.locals.user
    );

    const lock =
      locks.resource.find((lock) => lock.token === token) ||
      locks.depthInfinity.find((lock) => lock.token === token);

    if (lock == null) {
      // Does the lock exist?
      const allLocks = await this.getLocks(request, resource);
      const someoneElsesLock =
        allLocks.resource.find((lock) => lock.token === token) ||
        allLocks.depthInfinity.find((lock) => lock.token === token);
      if (someoneElsesLock != null) {
        // If the lock exists, it means the user doesn't have permission to
        // unlock it.
        throw new ForbiddenError(
          'You do not have permission to unlock this resource.'
        );
      }

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

    await lock.delete();

    response.status(204); // No Content
    response.end();
  }
}
