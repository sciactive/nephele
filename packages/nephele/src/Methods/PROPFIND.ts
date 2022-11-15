import type { Request } from 'express';

import type { AuthResponse, Resource } from '../Interfaces/index.js';
import {
  BadRequestError,
  ForbiddenError,
  NotAcceptableError,
  PropertyNotFoundError,
  UnauthorizedError,
} from '../Errors/index.js';
import { MultiStatus, Status, PropStatStatus } from '../MultiStatus.js';

import { Method } from './Method.js';

export class PROPFIND extends Method {
  async run(request: Request, response: AuthResponse) {
    const { url, encoding } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, 'PROPFIND');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    const depth = request.get('Depth') || 'infinity';
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
      await this.runPlugins(request, response, 'prePropfind', {
        method: this,
        resource,
        depth,
      })
    ) {
      return;
    }

    if (!['0', '1', 'infinity'].includes(depth)) {
      throw new BadRequestError(
        'Depth header must be one of "0", "1", or "infinity".'
      );
    }

    const xmlBody = await this.getBodyXML(request, response);
    const { output: xml, prefixes } = xmlBody
      ? await this.parseXml(xmlBody)
      : { output: null, prefixes: {} };

    let requestedProps: string[] = [];
    let allprop = true;
    let propname = false;

    if (xml != null) {
      if (!('propfind' in xml)) {
        throw new BadRequestError(
          'PROPFIND methods requires a propfind element.'
        );
      }

      if ('propname' in xml.propfind) {
        propname = true;
      }

      if (!('allprop' in xml.propfind)) {
        allprop = false;
      } else if ('include' in xml.propfind) {
        for (let include of xml.propfind.include) {
          requestedProps = [
            ...requestedProps,
            ...Object.keys(include).filter((name) => name !== '$'),
          ];
        }
      }

      if ('prop' in xml.propfind) {
        for (let prop of xml.propfind.prop) {
          requestedProps = [
            ...requestedProps,
            ...Object.keys(prop).filter((name) => name !== '$'),
          ];
        }
      }
    }

    await this.checkConditionalHeaders(request, response);

    if (
      await this.runPlugins(request, response, 'beforePropfind', {
        method: this,
        resource,
        depth,
      })
    ) {
      return;
    }

    const multiStatus = new MultiStatus();

    if (propname) {
      response.locals.debug(`Requested prop names.`);
    } else if (allprop) {
      response.locals.debug(
        `Requested all props.${
          requestedProps.length ? ` Includes: ${requestedProps.join(', ')}` : ''
        }`
      );
    } else {
      response.locals.debug(`Requested props: ${requestedProps.join(', ')}`);
    }
    response.locals.debug(`Requested depth: ${depth}`);

    let level = 0;
    const addResourceProps = async (resource: Resource) => {
      const url = await resource.getCanonicalUrl();
      response.locals.debug(
        `Retrieving props for ${await resource.getCanonicalPath()}`
      );

      try {
        // If the resource is the root of another adapter, we need its copy of the
        // resource in order to continue getting props.
        if (await this.isAdapterRoot(request, response, url)) {
          const absoluteUrl = new URL(
            url.toString().replace(/\/?$/, () => '/')
          );
          const adapter = await this.getAdapter(
            response,
            decodeURI(absoluteUrl.pathname.substring(request.baseUrl.length))
          );
          resource = await adapter.getResource(absoluteUrl, absoluteUrl);
        }
      } catch (e: any) {
        const error = new Status(url, 500);
        error.description = 'An internal server error occurred.';
        multiStatus.addStatus(error);
        return;
      }

      // Use the resource's adapter and baseUrl, because this could be on
      // another adapter than the request.
      if (
        !(await resource.adapter.isAuthorized(
          url,
          'PROPFIND',
          resource.baseUrl,
          response.locals.user
        ))
      ) {
        const error = new Status(url, 401);
        error.description =
          'The user is not authorized to get properties for this resource.';
        multiStatus.addStatus(error);
        return;
      }

      const status = new Status(url, 207);
      const props = await resource.getProperties();

      try {
        const supportsLocks = (
          await resource.adapter.getComplianceClasses(url, request, response)
        ).includes('2');

        if (propname) {
          const propnames = await props.listByUser(response.locals.user);
          const propStatStatus = new PropStatStatus(200);
          const propObj: { [k: string]: {} } = {};
          for (let name of propnames) {
            propObj[name] = {};
          }
          if (supportsLocks) {
            propObj.lockdiscovery = {};
          }
          propStatStatus.setProp(propObj);
          status.addPropStatStatus(propStatStatus);
        } else {
          let propObj: { [k: string]: any } = {};
          const forbiddenProps: string[] = [];
          const unauthorizedProps: string[] = [];
          const notFoundProps: string[] = [];
          const errorProps: string[] = [];
          if (allprop) {
            propObj = await props.getAllByUser(response.locals.user);

            for (let name in propObj) {
              if (propObj[name] instanceof ForbiddenError) {
                forbiddenProps.push(name);
                delete propObj[name];
              } else if (propObj[name] instanceof UnauthorizedError) {
                unauthorizedProps.push(name);
                delete propObj[name];
              } else if (propObj[name] instanceof PropertyNotFoundError) {
                notFoundProps.push(name);
                delete propObj[name];
              } else if (propObj[name] instanceof Error) {
                errorProps.push(name);
                delete propObj[name];
              }
            }
          }

          for (let name of requestedProps) {
            if (name in propObj) {
              continue;
            }

            if (name === 'lockdiscovery') {
              if (!supportsLocks) {
                notFoundProps.push(name);
              }
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
              } else if (e instanceof PropertyNotFoundError) {
                notFoundProps.push(name);
              } else {
                errorProps.push(name);
              }
            }
          }

          if (
            supportsLocks &&
            (allprop || requestedProps.includes('lockdiscovery'))
          ) {
            const currentLocks = await this.getLocks(
              request,
              response,
              resource
            );
            propObj.lockdiscovery = await this.formatLocks(currentLocks.all);
          }

          if (Object.keys(propObj).length) {
            const propStatStatus = new PropStatStatus(200);
            propStatStatus.setProp(propObj);
            status.addPropStatStatus(propStatStatus);
          }

          if (forbiddenProps.length) {
            const propStatStatus = new PropStatStatus(403);
            propStatStatus.description = `The user does not have access to the ${forbiddenProps
              .map((name) => name.replace('%%', ''))
              .join(', ')} propert${
              forbiddenProps.length === 1 ? 'y' : 'ies'
            }.`;
            propStatStatus.setProp(
              Object.fromEntries(forbiddenProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }

          if (unauthorizedProps.length) {
            const propStatStatus = new PropStatStatus(401);
            propStatStatus.description = `The user is not authorized to retrieve the ${unauthorizedProps
              .map((name) => name.replace('%%', ''))
              .join(', ')} propert${
              unauthorizedProps.length === 1 ? 'y' : 'ies'
            }.`;
            propStatStatus.setProp(
              Object.fromEntries(unauthorizedProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }

          if (notFoundProps.length) {
            const propStatStatus = new PropStatStatus(404);
            propStatStatus.description = `The ${notFoundProps
              .map((name) => name.replace('%%', ''))
              .join(', ')} propert${
              notFoundProps.length === 1 ? 'y was' : 'ies were'
            } not found.`;
            propStatStatus.setProp(
              Object.fromEntries(notFoundProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }

          if (errorProps.length) {
            const propStatStatus = new PropStatStatus(500);
            propStatStatus.description = `An error occurred while trying to retrieve the ${errorProps
              .map((name) => name.replace('%%', ''))
              .join(', ')} propert${errorProps.length === 1 ? 'y' : 'ies'}.`;
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

      if (await resource.isCollection()) {
        let children: Resource[] = [];
        try {
          children = await resource.getInternalMembers(response.locals.user);
        } catch (e: any) {
          if (!(e instanceof UnauthorizedError)) {
            throw e;
          }
          // Silently exclude members not visible to the user.
        }
        level++;
        for (let child of children) {
          await addResourceProps(child);
        }
        level--;
      }
    };
    await addResourceProps(resource);

    const responseXml = await this.renderXml(multiStatus.render(), prefixes);
    response.status(207); // Multi-Status
    response.set({
      'Content-Type': `${contentType}; charset=utf-8`,
    });
    this.sendBodyContent(response, responseXml, encoding);

    await this.runPlugins(request, response, 'afterPropfind', {
      method: this,
      resource,
      depth,
    });
  }
}
