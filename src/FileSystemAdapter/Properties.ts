import type { Properties as PropertiesInterface } from '../index.js';

import Resource from './Resource.js';
import User from './User.js';

export default class Properties implements PropertiesInterface {
  resource: Resource;

  constructor({ resource }: { resource: Resource }) {
    this.resource = resource;
  }

  async get(name: string) {
    if (name === 'Last-Modified') {
      try {
        const stats = await this.resource.getStats();
        return stats.mtime.toUTCString();
      } catch (e: any) {
        return '';
      }
    }

    return '';
  }
  async set(name: string, value: string) {
    return;
  }

  async getByUser(name: string, user: User) {
    return await this.get(name);
  }
  async setByUser(name: string, value: string, user: User) {
    await this.set(name, value);
  }

  async list() {
    return [] as string[];
  }
  async listLive() {
    return [] as string[];
  }
  async listDead() {
    return [] as string[];
  }
}
