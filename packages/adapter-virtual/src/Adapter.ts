import type { Request } from 'express';
import type {
  Adapter as AdapterInterface,
  AuthResponse,
  Method,
  User,
} from 'nephele';
import {
  BadGatewayError,
  MethodNotImplementedError,
  MethodNotSupportedError,
  ResourceNotFoundError,
} from 'nephele';

import Resource from './Resource.js';

export type File = {
  name: string;
  properties: {
    creationdate: Date;
    getlastmodified: Date;
    owner?: string;
    [k: string]: any;
  };
  locks: {
    [token: string]: {
      username: string;
      date: number;
      timeout: number;
      scope: 'exclusive' | 'shared';
      depth: '0' | 'infinity';
      provisional: boolean;
      owner: any;
    };
  };
  content: Buffer;
};

export type Folder = Omit<File, 'content'> & {
  children: (Folder | File)[];
};

export type RootFolder = Omit<Folder, 'name'>;

export type AdapterConfig = {
  /**
   * The root file entry to serve from the virtual adapter.
   */
  files: RootFolder;
};

/**
 * Nephele file system adapter.
 */
export default class Adapter implements AdapterInterface {
  files: RootFolder;

  constructor({ files }: AdapterConfig) {
    this.files = files;
  }

  urlToRelativePath(url: URL, baseUrl: URL) {
    if (
      !decodeURIComponent(url.pathname)
        .replace(/\/?$/, () => '/')
        .startsWith(decodeURIComponent(baseUrl.pathname))
    ) {
      return null;
    }

    return (
      '/' +
      decodeURIComponent(url.pathname)
        .substring(decodeURIComponent(baseUrl.pathname).length)
        .replace(/^\/?/, '')
        .replace(/\/?$/, '')
    );
  }

  basename(path: string) {
    return (
      path
        .split('/')
        .filter((part) => part != '')
        .pop() || path
    );
  }

  dirname(path: string) {
    const parts = path.split('/').filter((part) => part != '');
    parts.pop();
    return ['', ...parts].join('/');
  }

  async getComplianceClasses(
    _url: URL,
    _request: Request,
    _response: AuthResponse
  ) {
    // This adapter supports locks.
    return ['2'];
  }

  async getAllowedMethods(
    _url: URL,
    _request: Request,
    _response: AuthResponse
  ) {
    // This adapter doesn't support any WebDAV extensions that require
    // additional methods.
    return [];
  }

  async getOptionsResponseCacheControl(
    _url: URL,
    _request: Request,
    _response: AuthResponse
  ) {
    // This adapter doesn't do anything special for individual URLs, so a max
    // age of one week is fine.
    return 'max-age=604800';
  }

  async isAuthorized(url: URL, method: string, baseUrl: URL, user: User) {
    // What type of file access do we need?
    let access = 'u';

    if (['GET', 'HEAD', 'COPY', 'OPTIONS', 'PROPFIND'].includes(method)) {
      // Read operations.
      access = 'r';
    }

    if (
      ['POST', 'PUT', 'DELETE', 'MOVE', 'MKCOL', 'PROPPATCH'].includes(method)
    ) {
      // Write operations.
      access = 'w';
    }

    if (['SEARCH'].includes(method)) {
      // Execute operations. (Directory listing.)
      access = 'x';
    }

    if (['LOCK', 'UNLOCK'].includes(method)) {
      // Require the user to have write permission to lock and unlock a
      // resource.
      access = 'w';
    }

    if (access === 'u') {
      return false;
    }

    if (access === 'w') {
      try {
        const resource = await this.getResource(url, baseUrl);
        if (
          'owner' in resource.file.properties &&
          resource.file.properties.owner !== user.username
        ) {
          return false;
        }
      } catch (e: any) {
        try {
          const urlPath = this.urlToRelativePath(url, baseUrl);

          if (urlPath == null) {
            return false;
          }

          const parent = await this.getResource(
            new URL(this.dirname(url.toString())),
            baseUrl
          );

          if (
            'owner' in parent.file.properties &&
            parent.file.properties.owner !== user.username
          ) {
            return false;
          }
        } catch (e: any) {
          if (e instanceof ResourceNotFoundError) {
            return true;
          }
          throw e;
        }
      }
    }

    // If we get to here, it means either the file exists and user has
    // permission, or the file doesn't exist, and the user has access to the
    // directory above it.
    return true;
  }

  async getResource(url: URL, baseUrl: URL) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    const resource = new Resource({
      adapter: this,
      baseUrl,
      path,
    });

    if (!resource.exists) {
      throw new ResourceNotFoundError('Resource not found.');
    }

    return resource;
  }

  async newResource(url: URL, baseUrl: URL) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    return new Resource({
      adapter: this,
      baseUrl,
      path,
    });
  }

  async newCollection(url: URL, baseUrl: URL) {
    const path = this.urlToRelativePath(url, baseUrl);

    if (path == null) {
      throw new BadGatewayError(
        'The given path is not managed by this server.'
      );
    }

    return new Resource({
      adapter: this,
      baseUrl,
      path,
      collection: true,
    });
  }

  getMethod(method: string): typeof Method {
    // No additional methods to handle.
    if (method === 'POST' || method === 'PATCH') {
      throw new MethodNotSupportedError('Method not supported.');
    }
    throw new MethodNotImplementedError('Method not implemented.');
  }
}
