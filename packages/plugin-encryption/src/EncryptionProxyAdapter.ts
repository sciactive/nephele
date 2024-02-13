import type { Request } from 'express';
import type { Adapter, AuthResponse, Resource, User } from 'nephele';

import type Plugin from './Plugin.js';
import { EncryptionProxyResource } from './EncryptionProxyResource.js';

/**
 * A proxy adapter that handles encryption.
 */
export class EncryptionProxyAdapter implements Adapter {
  plugin: Plugin;
  targetAdapter: Adapter;
  key: Buffer;

  constructor(plugin: Plugin, targetAdapter: Adapter, key: Buffer) {
    this.plugin = plugin;
    this.targetAdapter = targetAdapter;
    this.key = key;
  }

  async getComplianceClasses(
    url: URL,
    request: Request,
    response: AuthResponse
  ) {
    return await this.targetAdapter.getComplianceClasses(
      url,
      request,
      response
    );
  }

  async getAllowedMethods(url: URL, request: Request, response: AuthResponse) {
    return await this.targetAdapter.getAllowedMethods(url, request, response);
  }

  async getOptionsResponseCacheControl(
    url: URL,
    request: Request,
    response: AuthResponse
  ) {
    return await this.targetAdapter.getOptionsResponseCacheControl(
      url,
      request,
      response
    );
  }

  async isAuthorized(url: URL, method: string, baseUrl: URL, user: User) {
    return await this.targetAdapter.isAuthorized(url, method, baseUrl, user);
  }

  async getResource(url: URL, baseUrl: URL): Promise<Resource> {
    const resource = await this.targetAdapter.getResource(url, baseUrl);
    return new EncryptionProxyResource(
      this.plugin,
      this,
      resource,
      baseUrl,
      this.key
    );
  }

  async newResource(url: URL, baseUrl: URL): Promise<Resource> {
    const resource = await this.targetAdapter.newResource(url, baseUrl);
    return new EncryptionProxyResource(
      this.plugin,
      this,
      resource,
      baseUrl,
      this.key
    );
  }

  async newCollection(url: URL, baseUrl: URL): Promise<Resource> {
    const resource = await this.targetAdapter.newCollection(url, baseUrl);
    return new EncryptionProxyResource(
      this.plugin,
      this,
      resource,
      baseUrl,
      this.key
    );
  }

  getMethod(method: string) {
    return this.targetAdapter.getMethod(method);
  }
}
