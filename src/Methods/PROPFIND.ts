import { inspect } from 'node:util';
import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  BadRequestError,
  ForbiddenError,
  NotAcceptableError,
  UnauthorizedError,
} from '../Errors/index.js';
import { MultiStatus, Status, PropStatStatus } from '../MultiStatus.js';

import { Method } from './Method.js';

export class PROPFIND extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'PROPFIND');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    let depth = request.get('Depth') || 'infinity';
    const resource = await this.adapter.getResource(url, request, response);

    if (!['0', '1', 'infinity'].includes(depth)) {
      throw new BadRequestError(
        'Depth header must be one of "0", "1", or "infinity".'
      );
    }

    const xml = await this.getBodyXML(request);
    response.locals.debug('XML Body', inspect(xml, false, null));

    let requestedProps: string[] = [];
    let allprop = true;
    let propname = false;
    const multiStatus = new MultiStatus();

    if (xml != null) {
      // TODO: parse incoming XML
    }

    let level = 0;
    const addResourceProps = async (resource: Resource) => {
      const url = await resource.getCanonicalUrl();
      response.locals.debug(`Retrieving props for ${url}`);

      if (
        !(await this.adapter.isAuthorized(url, 'PROPFIND', request, response))
      ) {
        const error = new Status(url.toString(), 401);
        error.description =
          'The user is not authorized to get properties for this resource.';
        multiStatus.addStatus(error);
        return;
      }

      const status = new Status(url.toString(), 207);
      const props = await resource.getProperties();

      try {
        if (propname) {
          const propnames = await props.listByUser(response.locals.user);
          const propStatStatus = new PropStatStatus(200);
          const propObj: { [k: string]: {} } = {};
          for (let name of propnames) {
            propObj[name] = {};
          }
          propStatStatus.setProp(propObj);
          status.addPropStatStatus(propStatStatus);
        } else {
          let propObj: { [k: string]: any } = {};
          const forbiddenProps: string[] = [];
          const unauthorizedProps: string[] = [];
          const errorProps: string[] = [];
          if (allprop) {
            propObj = await props.getAllByUser(response.locals.user);
          }

          for (let name of requestedProps) {
            if (name in propObj) {
              continue;
            }

            try {
              const value = await props.getByUser(name, response.locals.user);
              propObj[name] = value;
            } catch (e: any) {
              if (e instanceof ForbiddenError) {
                forbiddenProps.push(name);
              } else if (e instanceof UnauthorizedError) {
                unauthorizedProps.push(name);
              } else {
                errorProps.push(name);
              }
            }
          }

          if (Object.keys(propObj).length) {
            const propStatStatus = new PropStatStatus(200);
            propStatStatus.setProp(propObj);
            status.addPropStatStatus(propStatStatus);
          }

          if (forbiddenProps.length) {
            const propStatStatus = new PropStatStatus(403);
            propStatStatus.description = `The user does not have access to the ${forbiddenProps.join(
              ', '
            )} propert${forbiddenProps.length === 1 ? 'y' : 'ies'}.`;
            propStatStatus.setProp(
              Object.fromEntries(forbiddenProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }

          if (unauthorizedProps.length) {
            const propStatStatus = new PropStatStatus(401);
            propStatStatus.description = `The user is not authorized to retrieve the ${unauthorizedProps.join(
              ', '
            )} propert${unauthorizedProps.length === 1 ? 'y' : 'ies'}.`;
            propStatStatus.setProp(
              Object.fromEntries(unauthorizedProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }

          if (errorProps.length) {
            const propStatStatus = new PropStatStatus(401);
            propStatStatus.description = `An error occurred while trying to retrieve the ${errorProps.join(
              ', '
            )} propert${errorProps.length === 1 ? 'y' : 'ies'}.`;
            propStatStatus.setProp(
              Object.fromEntries(errorProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }
        }
      } catch (e: any) {
        const propStatStatus = new PropStatStatus(500);
        propStatStatus.description = 'An internal server error occurred.';
        status.addPropStatStatus(propStatStatus);
      }

      multiStatus.addStatus(status);

      if (depth === '0' || (level === 1 && depth === '1')) {
        return;
      }

      level++;
      const children = await resource.getInternalMembers();
      for (let child of children) {
        await addResourceProps(child);
      }
    };
    await addResourceProps(resource);

    const responseXml = multiStatus.render();
    response.status(207); // Multi-Status
    response.set({
      'Content-Type': contentType,
      'Content-Length': responseXml.length,
    });
    response.send(responseXml);
  }
}
