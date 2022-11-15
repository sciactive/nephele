import type { Request } from 'express';
import {
  Plugin as PluginInterface,
  AuthResponse,
  Method,
  Resource,
  Properties,
} from 'nephele';
import { ResourceNotFoundError } from 'nephele';
// @ts-ignore
import IndexPage from './IndexPage.cjs';

/**
 * Nephele index plugin.
 *
 * This plugin serves index files and directory listings.
 */
export default class Plugin implements PluginInterface {
  name = 'Nephele Server';

  constructor({ name }: { name?: string } = {}) {
    if (name != null) {
      this.name = name;
    }
  }

  async beforeGet(
    request: Request,
    response: AuthResponse,
    {
      method,
      resource,
    }: { method: Method; resource: Resource; properties: Properties }
  ) {
    if (await resource.isCollection()) {
      const indexFile = await this._getIndexFile(
        request,
        response,
        method,
        resource
      );

      if (indexFile != null) {
        const originalUrl = request.url;

        request.url = (await indexFile.getCanonicalUrl()).pathname;

        console.log(request.url);
        await method.run(request, response);

        request.url = originalUrl;
        return false;
      } else {
        const listing = await resource.getInternalMembers(response.locals.user);
        const entries = await Promise.all(
          listing.map(async (resource: Resource) => {
            const lastModified = await (
              await resource.getProperties()
            ).get('getlastmodified');

            return {
              name: await resource.getCanonicalName(),
              url: await resource.getCanonicalUrl(),
              size: await resource.getLength(),
              lastModified: new Date(
                typeof lastModified === 'string' ? lastModified : 0
              ).getTime(),
              type: await resource.getMediaType(),
              directory: await resource.isCollection(),
            };
          })
        );

        const { head, html, css } = IndexPage.default.render({
          entries,
          self: {
            name: await resource.getCanonicalName(),
            url: await resource.getCanonicalUrl(),
          },
          urlParams: request.query,
          name: this.name,
        });

        response.set({
          'Cache-Control': 'private, no-cache',
          Date: new Date().toUTCString(),
          'Content-Type': 'text/html',
        });

        response.send(`<!DOCTYPE html>
<html>
  <head>
    <title>Index of ${
      (await resource.getCanonicalName()) ||
      new URL(request.url, `http://${request.headers.host}/`).pathname
    }</title>
    ${head}
    <style type="text/css">
      ${css.code}
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>
`);
        return false;
      }
    }
  }

  async _getIndexFile(
    request: Request,
    response: AuthResponse,
    method: Method,
    resource: Resource
  ) {
    const url = await resource.getCanonicalUrl();
    const indexHtmlUrl = new URL('index.html', url);
    const indexHtmUrl = new URL('index.htm', url);

    const adapter = await method.getAdapter(
      response,
      decodeURI(
        indexHtmlUrl.pathname.substring(request.baseUrl.length)
      ).replace(/\/?$/, () => '/')
    );

    let indexResource: Resource | undefined = undefined;
    try {
      indexResource = await adapter.getResource(
        indexHtmlUrl,
        response.locals.baseUrl
      );
    } catch (e: any) {
      if (!(e instanceof ResourceNotFoundError)) {
        throw e;
      }
    }

    if (indexResource != null) {
      return indexResource;
    }

    try {
      indexResource = await adapter.getResource(
        indexHtmUrl,
        response.locals.baseUrl
      );
    } catch (e: any) {
      if (!(e instanceof ResourceNotFoundError)) {
        throw e;
      }
    }

    if (indexResource != null) {
      return indexResource;
    }
  }
}
