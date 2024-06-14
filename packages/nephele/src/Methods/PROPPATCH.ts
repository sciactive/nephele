import type { Request } from 'express';
import * as xml2js from 'xml2js';

import type { AuthResponse } from '../Interfaces/index.js';
import {
  BadRequestError,
  FailedDependencyError,
  LockedError,
  NotAcceptableError,
  PropertyIsProtectedError,
} from '../Errors/index.js';
import { catchErrors } from '../catchErrors.js';
import { MultiStatus, Status, PropStatStatus } from '../MultiStatus.js';

import { Method } from './Method.js';

export class PROPPATCH extends Method {
  xmlParserPreserveOrder = new xml2js.Parser({
    xmlns: true,
    explicitChildren: true,
    preserveChildrenOrder: true,
  });

  async run(request: Request, response: AuthResponse) {
    const { url, encoding } = this.getRequestData(request, response);

    if (
      await this.runPlugins(request, response, 'beginProppatch', {
        method: this,
        url,
      })
    ) {
      return;
    }

    await this.checkAuthorization(request, response, 'PROPPATCH');

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    const resource = await response.locals.adapter.getResource(
      url,
      response.locals.baseUrl,
    );

    if ((await resource.isCollection()) && !url.toString().endsWith('/')) {
      response.set({
        'Content-Location': `${url}/`,
      });
    }

    if (
      await this.runPlugins(request, response, 'preProppatch', {
        method: this,
        resource,
      })
    ) {
      return;
    }

    const props = await resource.getProperties();

    const xmlBody = await this.getBodyXML(request, response);

    if (xmlBody == null) {
      throw new BadRequestError('PROPPATCH method requires a body.');
    }

    const { output: xml, prefixes } = await this.parseXml(xmlBody);

    if (xml == null) {
      throw new BadRequestError('PROPPATCH method requires a body.');
    }

    if (!('propertyupdate' in xml)) {
      throw new BadRequestError(
        'PROPPATCH methods requires a propertyupdate element.',
      );
    }

    const lockPermission = await this.getLockPermission(
      request,
      response,
      resource,
      response.locals.user,
    );

    if (lockPermission === 0) {
      throw new LockedError(
        'The user does not have permission to modify the locked resource.',
      );
    }
    const order = await this.getPropPatchOrder(xmlBody);
    const propErrors: { [k: string]: Error } = {};

    const setArray: any[] =
      'set' in xml.propertyupdate
        ? Array.isArray(xml.propertyupdate.set)
          ? xml.propertyupdate.set
          : [xml.propertyupdate.set]
        : [];
    const removeArray: any[] =
      'remove' in xml.propertyupdate
        ? Array.isArray(xml.propertyupdate.remove)
          ? xml.propertyupdate.remove
          : [xml.propertyupdate.remove]
        : [];

    const instructions: ['set' | 'remove', string, any][] = [];

    for (let action of order) {
      const array = action === 'set' ? setArray.shift() : removeArray.shift();

      if (!('prop' in array)) {
        throw new BadRequestError('Invalid XML provided.');
      }

      const propArray = Array.isArray(array.prop) ? array.prop : [array.prop];

      for (let propEl of propArray) {
        for (let prop in propEl) {
          // This is the default error.
          propErrors[prop] = new FailedDependencyError();

          const values = Array.isArray(propEl[prop])
            ? propEl[prop]
            : [propEl[prop]];

          if (prop === 'lockdiscovery') {
            propErrors[prop] = new PropertyIsProtectedError(
              `${prop} is a protected property.`,
            );
          }

          for (let value of values) {
            if (action === 'set') {
              if (
                typeof value === 'object' &&
                Object.keys(value).length === 1 &&
                '_' in value
              ) {
                // String value.
                instructions.push(['set', prop, value._]);
              } else {
                instructions.push(['set', prop, value]);
              }
            } else {
              instructions.push(['remove', prop, undefined]);
            }
          }
        }
      }
    }

    await this.checkConditionalHeaders(request, response);

    if (
      await this.runPlugins(request, response, 'beforeProppatch', {
        method: this,
        resource,
      })
    ) {
      return;
    }

    const multiStatus = new MultiStatus();
    const status = new Status(url, 207);

    const errors = await props.runInstructionsByUser(
      instructions,
      response.locals.user,
    );

    if (errors && errors.length) {
      for (let error of errors) {
        const [name, e] = error;
        propErrors[name] = e;
      }

      const results = Object.entries(propErrors);
      for (let result of results) {
        const [name, error] = result;

        const run = catchErrors(
          async () => {
            throw error;
          },
          async (code, message, error) => {
            if (code === 500 && error) {
              response.locals.debug('Unknown Error: %o', error);
            }

            const propStatStatus = new PropStatStatus(code);
            if (message) {
              propStatStatus.description = message;
            }

            if (error instanceof PropertyIsProtectedError) {
              propStatStatus.setBody({
                error: [{ 'cannot-modify-protected-property': {} }],
              });
            }

            propStatStatus.setProp({ [name]: {} });

            response.locals.errors.push(propStatStatus);
            status.addPropStatStatus(propStatStatus);
          },
        );

        await run();
      }
    } else {
      const propNames = Object.keys(propErrors);
      const propStatStatus = new PropStatStatus(200);
      propStatStatus.setProp(
        Object.fromEntries(propNames.map((propName) => [propName, {}])),
      );
      status.addPropStatStatus(propStatStatus);
    }

    multiStatus.addStatus(status);

    const responseXml = await this.renderXml(multiStatus.render(), prefixes);
    response.status(207); // Multi-Status
    response.set({
      'Content-Type': `${contentType}; charset=utf-8`,
    });
    this.sendBodyContent(response, responseXml, encoding);

    await this.runPlugins(request, response, 'afterProppatch', {
      method: this,
      resource,
    });
  }

  async getPropPatchOrder(xmlBody: string) {
    let parsed = await this.xmlParserPreserveOrder.parseStringPromise(xmlBody);
    const order: ('set' | 'remove')[] = [];

    const propertyupdate: any = (Object.entries(parsed).find(
      ([_name, value]: [string, any]) =>
        value.$ns.uri === 'DAV:' && value.$ns.local === 'propertyupdate',
    ) || ['', {}])[1];

    for (let item of propertyupdate.$$) {
      if (item.$ns.uri === 'DAV:') {
        if (!['set', 'remove'].includes(item.$ns.local)) {
          throw new BadRequestError('Invalid XML provided.');
        }
        order.push(item.$ns.local);
      }
    }

    return order;
  }
}
