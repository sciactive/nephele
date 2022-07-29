import fsp from 'node:fs/promises';

import type { Properties as PropertiesInterface } from '../index.js';
import { PropertyIsProtectedError, PropertyNotFoundError } from '../index.js';

import Resource from './Resource.js';
import User from './User.js';

export default class Properties implements PropertiesInterface {
  resource: Resource;

  constructor({ resource }: { resource: Resource }) {
    this.resource = resource;
  }

  async get(name: string) {
    switch (name) {
      case 'creationdate': {
        const stats = await this.resource.getStats();
        return stats.ctime.toISOString();
      }
      case 'getcontentlength':
        return `${await this.resource.getLength()}`;
      case 'getcontenttype':
        return await this.resource.getMediaType();
      case 'getetag':
        return await this.resource.getEtag();
      case 'getlastmodified': {
        const stats = await this.resource.getStats();
        return stats.mtime.toISOString();
      }
      case 'lockdiscovery':
        // TODO: Implement this. (Page 94)
        return '';
      case 'resourcetype':
        if (await this.resource.isCollection()) {
          return { collection: {} };
        } else {
          return {};
        }
      case 'supportedlock':
        return {
          lockentry: [
            {
              lockscope: { exclusive: {} },
              locktype: { write: {} },
            },
            {
              lockscope: { shared: {} },
              locktype: { write: {} },
            },
          ],
        };
    }

    // Fall back to a file based prop store.
    const filepath = await this.resource.getPropFilePath();
    try {
      const props = JSON.parse((await fsp.readFile(filepath)).toString());

      if (!(name in props['*'])) {
        throw new PropertyNotFoundError(
          `${name} property doesn't exist on resource.`
        );
      }

      return props['*'][name];
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        throw new PropertyNotFoundError(
          `${name} property doesn't exist on resource.`
        );
      } else {
        throw e;
      }
    }
  }

  async getByUser(name: string, _user: User) {
    return await this.get(name);
  }

  async set(name: string, value: string) {
    if (
      [
        'creationdate',
        'getcontentlength',
        'getcontenttype',
        'getetag',
        'getlastmodified',
        'lockdiscovery',
        'resourcetype',
        'supportedlock',
      ].indexOf(name) > -1
    ) {
      throw new PropertyIsProtectedError(`${name} is a protected property.`);
    }

    // Fall back to a file based prop store.
    const filepath = await this.resource.getPropFilePath();
    let props: { [k: string]: any } = {};

    try {
      props = JSON.parse((await fsp.readFile(filepath)).toString());
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }

    let changed = false;
    if (value === undefined) {
      if ('*' in props && name in props['*']) {
        delete props['*'][name];
        changed = true;
      }
    } else {
      if (!('*' in props)) {
        props['*'] = {};
      }

      props['*'][name] = value;
      changed = true;
    }

    if (changed) {
      await fsp.writeFile(filepath, JSON.stringify(props, null, 2));
    }
  }

  async setByUser(name: string, value: string, _user: User) {
    await this.set(name, value);
  }

  async getAll() {
    const filepath = await this.resource.getPropFilePath();
    let props: { [k: string]: any } = {};

    try {
      props = JSON.parse((await fsp.readFile(filepath)).toString());
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }

    return {
      ...props['*'],
      creationdate: await this.get('creationdate'),
      getcontentlength: await this.get('getcontentlength'),
      getcontenttype: await this.get('getcontenttype'),
      getetag: await this.get('getetag'),
      getlastmodified: await this.get('getlastmodified'),
      lockdiscovery: await this.get('lockdiscovery'),
      resourcetype: await this.get('resourcetype'),
      supportedlock: await this.get('supportedlock'),
    };
  }

  async getAllByUser(_user: User) {
    return await this.getAll();
  }

  async list() {
    return [...(await this.listLive()), ...(await this.listDead())];
  }

  async listByUser(_user: User) {
    return await this.list();
  }

  async listLive() {
    return [
      'creationdate',
      'getcontentlength',
      'getcontenttype',
      'getetag',
      'getlastmodified',
      'lockdiscovery',
      'resourcetype',
      'supportedlock',
    ];
  }

  async listLiveByUser(_user: User) {
    return await this.listLive();
  }

  async listDead() {
    const filepath = await this.resource.getPropFilePath();
    let props: { [k: string]: any } = {};

    try {
      props = JSON.parse((await fsp.readFile(filepath)).toString());
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }

    return [
      // TODO: Should these be included if they're not defined yet.
      // 'displayname',
      // 'getcontentlanguage',
      ...Object.keys(props['*'] || {}),
    ];
  }

  async listDeadByUser(_user: User) {
    return await this.listDead();
  }
}
