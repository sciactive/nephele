import type { Properties as PropertiesInterface } from '../index.js';

import Resource from './Resource.js';
import User from './User.js';

export default class Properties implements PropertiesInterface {
  resource: Resource;

  constructor({ resource }: { resource: Resource }) {
    this.resource = resource;
  }

  async get(name: string) {
    return `${name}`;
  }
  async set(name: string, value: string) {
    return;
  }

  async getByUser(name: string, user: User) {
    return `${name}`;
  }
  async setByUser(name: string, value: string, user: User) {
    return;
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
