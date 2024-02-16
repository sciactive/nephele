import type { Request } from 'express';
import type { Adapter, AuthResponse, Resource, User } from 'nephele';
import { minimatch } from 'minimatch';

import type Plugin from './Plugin.js';
import { EncryptionProxyResource } from './EncryptionProxyResource.js';

/**
 * A proxy adapter that handles encryption.
 */
export class EncryptionProxyAdapter implements Adapter {
  plugin: Plugin;
  targetAdapter: Adapter;
  keys: { content: Buffer; name: Buffer; nameIV: Buffer };
  baseUrl: URL;

  constructor(
    plugin: Plugin,
    targetAdapter: Adapter,
    keys: { content: Buffer; name: Buffer; nameIV: Buffer },
    baseURL: URL
  ) {
    this.plugin = plugin;
    this.targetAdapter = targetAdapter;
    this.keys = keys;
    this.baseUrl = baseURL;
  }

  /**
   * Encrypt a non-encoded path.
   */
  async encryptPath(path: string) {
    const parts = path.split('/');
    const oldparts: string[] = [];
    const newparts: string[] = [];

    for (let part of parts) {
      if (this.shouldEncryptPath(['', ...oldparts, part].join('/'))) {
        newparts.push(
          part &&
            (await this.plugin.getEncryptedFilename(
              this.keys.name,
              this.keys.nameIV,
              part
            ))
        );
      } else {
        newparts.push(part);
      }
      oldparts.push(part);
    }

    const newpath = newparts.join('/');
    return newpath;
  }

  async encryptUrl(url: URL) {
    const path = url.pathname
      .slice(this.baseUrl.pathname.length)
      .split('/')
      .map((part) => decodeURIComponent(part))
      .join('/');
    const newpath = path && (await this.encryptPath(path));
    return new URL(
      newpath
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/'),
      this.baseUrl
    );
  }

  /**
   * Decrypt a non-encoded path.
   */
  async decryptPath(path: string) {
    const parts = path.split('/');
    const newparts: string[] = [];

    for (let part of parts) {
      if (
        part.startsWith('$E$') &&
        this.shouldEncryptPath(['', ...newparts, part].join('/'))
      ) {
        newparts.push(
          await this.plugin.getDecryptedFilename(
            this.keys.name,
            this.keys.nameIV,
            part
          )
        );
      } else {
        newparts.push(part);
      }
    }

    return newparts.join('/');
  }

  async decryptUrl(url: URL) {
    const path = url.pathname
      .slice(this.baseUrl.pathname.length)
      .split('/')
      .map((part) => decodeURIComponent(part))
      .join('/');
    const newpath = path && (await this.decryptPath(path));
    return new URL(
      newpath
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/'),
      this.baseUrl
    );
  }

  shouldEncryptUrl(url: URL) {
    const path = url.pathname
      .split('/')
      .map((part) => decodeURIComponent(part))
      .join('/');
    return this.shouldEncryptPath(path);
  }

  shouldEncryptPath(path: string) {
    for (let exclude of this.plugin.exclude) {
      if (minimatch(path, exclude)) {
        return false;
      }
    }
    return true;
  }

  async getComplianceClasses(
    url: URL,
    request: Request,
    response: AuthResponse
  ) {
    return await this.targetAdapter.getComplianceClasses(
      await this.encryptUrl(url),
      request,
      response
    );
  }

  async getAllowedMethods(url: URL, request: Request, response: AuthResponse) {
    return await this.targetAdapter.getAllowedMethods(
      await this.encryptUrl(url),
      request,
      response
    );
  }

  async getOptionsResponseCacheControl(
    url: URL,
    request: Request,
    response: AuthResponse
  ) {
    return await this.targetAdapter.getOptionsResponseCacheControl(
      await this.encryptUrl(url),
      request,
      response
    );
  }

  async isAuthorized(url: URL, method: string, baseUrl: URL, user: User) {
    return await this.targetAdapter.isAuthorized(
      await this.encryptUrl(url),
      method,
      baseUrl,
      user
    );
  }

  async getResource(url: URL, baseUrl: URL): Promise<Resource> {
    const resource = await this.targetAdapter.getResource(
      await this.encryptUrl(url),
      baseUrl
    );
    return new EncryptionProxyResource(
      this.plugin,
      this,
      resource,
      baseUrl,
      this.keys
    );
  }

  async newResource(url: URL, baseUrl: URL): Promise<Resource> {
    const resource = await this.targetAdapter.newResource(
      await this.encryptUrl(url),
      baseUrl
    );
    return new EncryptionProxyResource(
      this.plugin,
      this,
      resource,
      baseUrl,
      this.keys
    );
  }

  async newCollection(url: URL, baseUrl: URL): Promise<Resource> {
    const resource = await this.targetAdapter.newCollection(
      await this.encryptUrl(url),
      baseUrl
    );
    return new EncryptionProxyResource(
      this.plugin,
      this,
      resource,
      baseUrl,
      this.keys
    );
  }

  getMethod(method: string) {
    return this.targetAdapter.getMethod(method);
  }
}
