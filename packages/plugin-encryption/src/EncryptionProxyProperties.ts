import type { Properties, User } from 'nephele';

import type Plugin from './Plugin.js';
import type { EncryptionProxyResource } from './EncryptionProxyResource.js';

export class EncryptionProxyProperties implements Properties {
  plugin: Plugin;
  resource: EncryptionProxyResource;
  targetProperties: Properties;

  constructor(
    plugin: Plugin,
    resource: EncryptionProxyResource,
    targetProperties: Properties
  ) {
    this.plugin = plugin;
    this.resource = resource;
    this.targetProperties = targetProperties;
  }

  async get(name: string) {
    let prop = await this.targetProperties.get(name);

    if (await this.resource.shouldEncrypt()) {
      if (name === 'getcontentlength') {
        let padding = await this.targetProperties.get(
          'nephele-encryption-padding-bytes'
        );
        if (typeof prop === 'string' && typeof padding === 'string') {
          prop = `${parseFloat(prop) - parseFloat(padding)}`;
        }
      }

      if (name.startsWith('nephele-encryption-')) {
        return undefined;
      }
    }

    return prop;
  }

  async getByUser(name: string, user: User) {
    let prop = await this.targetProperties.getByUser(name, user);

    if (await this.resource.shouldEncrypt()) {
      if (name === 'getcontentlength') {
        let padding = await this.targetProperties.get(
          'nephele-encryption-padding-bytes'
        );
        if (typeof prop === 'string' && typeof padding === 'string') {
          prop = `${parseFloat(prop) - parseFloat(padding)}`;
        }
      }

      if (name.startsWith('nephele-encryption-')) {
        return undefined;
      }
    }

    return prop;
  }

  async set(name: string, value: string | Object | Object[] | undefined) {
    return await this.targetProperties.set(name, value);
  }

  async setByUser(
    name: string,
    value: string | Object | Object[] | undefined,
    user: User
  ) {
    return await this.targetProperties.setByUser(name, value, user);
  }

  async remove(name: string) {
    return await this.targetProperties.remove(name);
  }

  async removeByUser(name: string, user: User) {
    return await this.targetProperties.removeByUser(name, user);
  }

  async runInstructions(instructions: ['set' | 'remove', string, any][]) {
    return await this.targetProperties.runInstructions(instructions);
  }

  async runInstructionsByUser(
    instructions: ['set' | 'remove', string, any][],
    user: User
  ) {
    return await this.targetProperties.runInstructionsByUser(
      instructions,
      user
    );
  }

  async getAll() {
    let props = await this.targetProperties.getAll();

    if (await this.resource.shouldEncrypt()) {
      let padding = props['nephele-encryption-padding-bytes'];

      for (let name in props) {
        if (name === 'getcontentlength') {
          let size = props[name];
          if (typeof size === 'string' && typeof padding === 'string') {
            props[name] = `${parseFloat(size) - parseFloat(padding)}`;
          }
        }

        if (name.startsWith('nephele-encryption-')) {
          delete props[name];
        }
      }
    }

    return props;
  }

  async getAllByUser(user: User) {
    let props = await this.targetProperties.getAllByUser(user);

    if (await this.resource.shouldEncrypt()) {
      let padding = props['nephele-encryption-padding-bytes'];

      for (let name in props) {
        if (name === 'getcontentlength') {
          let size = props[name];
          if (typeof size === 'string' && typeof padding === 'string') {
            props[name] = `${parseFloat(size) - parseFloat(padding)}`;
          }
        }

        if (name.startsWith('nephele-encryption-')) {
          delete props[name];
        }
      }
    }

    return props;
  }

  async list() {
    let props = await this.targetProperties.list();
    return props.filter((name) => !name.startsWith('nephele-encryption-'));
  }

  async listByUser(user: User) {
    let props = await this.targetProperties.listByUser(user);
    return props.filter((name) => !name.startsWith('nephele-encryption-'));
  }

  async listLive() {
    return await this.targetProperties.listLive();
  }

  async listLiveByUser(user: User) {
    return await this.targetProperties.listLiveByUser(user);
  }

  async listDead() {
    let props = await this.targetProperties.listDead();
    return props.filter((name) => !name.startsWith('nephele-encryption-'));
  }

  async listDeadByUser(user: User) {
    let props = await this.targetProperties.listDeadByUser(user);
    return props.filter((name) => !name.startsWith('nephele-encryption-'));
  }
}
