import path from 'node:path';
import type { Request } from 'express';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { S3 } from '@aws-sdk/client-s3';
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

export type AdapterConfig = {
  /**
   * The S3 client config object.
   *
   * See https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/TypeAlias/S3ClientConfigType/
   */
  s3Config: S3ClientConfig;
  /**
   * The S3 bucket.
   */
  bucket: string;
  /**
   * The number of chunks to upload simultaneously to the storage.
   */
  uploadQueueSize?: number;
  /**
   * The path in the S3 bucket to be the root of the adapter. '' means the root
   * of the bucket.
   */
  root?: string;
};

/**
 * Nephele S3 adapter.
 */
export default class Adapter implements AdapterInterface {
  s3: S3;
  bucket: string;
  uploadQueueSize = 4;
  root = '';

  constructor({ s3Config, bucket, uploadQueueSize, root }: AdapterConfig) {
    this.s3 = new S3(s3Config);
    this.bucket = bucket;
    if (uploadQueueSize != null) {
      this.uploadQueueSize = uploadQueueSize;
    }
    if (root != null) {
      this.root = root.split('/').map(encodeURIComponent).join('/');
    }
  }

  urlToRelativePath(url: URL, baseUrl: URL) {
    if (
      !decodeURIComponent(url.pathname)
        .replace(/\/?$/, () => '/')
        .startsWith(decodeURIComponent(baseUrl.pathname))
    ) {
      return null;
    }

    return path.join(
      path.sep,
      ...decodeURIComponent(url.pathname)
        .substring(decodeURIComponent(baseUrl.pathname).length)
        .replace(/\/?$/, '')
        .split('/')
    );
  }

  relativePathToUrl(pathname: string, baseUrl: URL) {
    const urlPath = pathname
      .split(path.sep)
      .filter((part) => part !== '')
      .map(encodeURIComponent)
      .join('/');

    return new URL(urlPath, baseUrl);
  }

  relativePathToKey(pathname: string) {
    return [this.root, ...pathname.split(path.sep).map(encodeURIComponent)]
      .filter((part) => part != '')
      .join('/');
  }

  keyToRelativePath(key: string) {
    return (
      path.sep +
      [...key.substring(this.root.length).split('/')]
        .filter((part) => part != '')
        .map(decodeURIComponent)
        .join(path.sep)
    );
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

  async isAuthorized(_url: URL, _method: string, _baseUrl: URL, _user: User) {
    // This adapter doesn't do any access control.
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

    if (!(await resource.exists())) {
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
      exists: false,
      collection: false,
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
      exists: false,
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
