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
import IndexPage from './IndexPage.js';

export type PluginConfig = {
  /**
   * The name of the server reported on the directory listing pages.
   */
  name?: string;
  /**
   * Whether to serve "index.html" and "index.htm" files when a GET request for
   * a directory is made.
   */
  serveIndexes?: boolean;
  /**
   * Whether to serve directory listings when a request to a directory is made.
   *
   * If the user has access to create/modify/delete files in the directory, the
   * listing page will include forms to do those tasks (if showForms is not
   * false).
   */
  serveListings?: boolean;
  /**
   * Whether to show file management forms on directory listings.
   */
  showForms?: boolean;
};

/**
 * Nephele index plugin.
 *
 * This plugin serves index files and directory listings.
 */
export default class Plugin implements PluginInterface {
  name = 'Nephele Server';
  serveIndexes = true;
  serveListings = true;
  showForms = true;

  constructor({
    name,
    serveIndexes,
    serveListings,
    showForms,
  }: PluginConfig = {}) {
    if (name != null) {
      this.name = name;
    }
    if (serveIndexes != null) {
      this.serveIndexes = serveIndexes;
    }
    if (serveListings != null) {
      this.serveListings = serveListings;
    }
    if (showForms != null) {
      this.showForms = showForms;
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

      if (indexFile != null && this.serveIndexes) {
        const originalUrl = request.url;

        request.url = (await indexFile.getCanonicalUrl()).pathname;
        await method.run(request, response);
        request.url = originalUrl;

        return false;
      } else if (this.serveListings) {
        const listing = await resource.getInternalMembers(response.locals.user);
        const entries = await Promise.all(
          listing.map(async (resource: Resource) => {
            const lastModified = await (
              await resource.getProperties()
            ).get('getlastmodified');
            const url = await resource.getCanonicalUrl();

            let canRead = true;
            try {
              await method.checkAuthorization(request, response, 'GET', url);
            } catch (e: any) {
              canRead = false;
            }

            let canMove = true;
            try {
              await method.checkAuthorization(request, response, 'MOVE', url);
            } catch (e: any) {
              canMove = false;
            }

            let canDelete = true;
            try {
              await method.checkAuthorization(request, response, 'DELETE', url);
            } catch (e: any) {
              canDelete = false;
            }

            return {
              name: await resource.getCanonicalName(),
              url,
              size: await resource.getLength(),
              lastModified: new Date(
                typeof lastModified === 'string' ? lastModified : 0
              ).getTime(),
              type: await resource.getMediaType(),
              directory: await resource.isCollection(),
              canRead,
              canMove,
              canDelete,
            };
          })
        );

        let canUpload = true;
        try {
          await method.checkAuthorization(
            request,
            response,
            'PUT',
            new URL(
              `${request.url}`.replace(/\/?$/, '/') +
                '--nephele-new-file-name--',
              `${request.protocol}://${request.headers.host}`
            )
          );
        } catch (e: any) {
          canUpload = false;
        }

        let canMkdir = true;
        try {
          await method.checkAuthorization(
            request,
            response,
            'MKCOL',
            new URL(
              `${request.url}`.replace(/\/?$/, '/') +
                '--nephele-new-directory-name--',
              `${request.protocol}://${request.headers.host}`
            )
          );
        } catch (e: any) {
          canMkdir = false;
        }

        const { head, html, css } = IndexPage.render({
          entries,
          self: {
            name: await resource.getCanonicalName(),
            url: await resource.getCanonicalUrl(),
          },
          urlParams: request.query,
          name: this.name,
          showForms: this.showForms,
          canUpload,
          canMkdir,
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
