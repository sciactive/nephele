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
        return stats.mtime.toUTCString();
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
      case 'quota-available-bytes':
        return `${await this.resource.getFreeSpace()}`;
      case 'quota-used-bytes':
        return `${await this.resource.getTotalSpace()}`;
      case 'LCGDM:%%mode':
        try {
          const stats = await this.resource.getStats();
          return `${stats.mode.toString(8)}`;
        } catch (e: any) {
          if (e.code === 'ENOENT') {
            throw new PropertyNotFoundError(
              `${name} property doesn't exist on resource.`
            );
          } else {
            throw e;
          }
        }
      case 'owner':
        if (this.resource.adapter.pam) {
          try {
            const stats = await this.resource.getStats();
            return await this.resource.adapter.getUsername(stats.uid);
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
      case 'group':
        if (this.resource.adapter.pam) {
          try {
            const stats = await this.resource.getStats();
            return await this.resource.adapter.getGroupname(stats.gid);
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
    }

    // Fall back to a file based prop store.
    const filepath = await this.resource.getPropFilePath();
    try {
      const props = JSON.parse((await fsp.readFile(filepath)).toString());

      if (!('*' in props) || !(name in props['*'])) {
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
        'quota-available-bytes',
        'quota-used-bytes',
        'owner',
        'group',
      ].includes(name)
    ) {
      throw new PropertyIsProtectedError(`${name} is a protected property.`);
    }

    if (name === 'LCGDM:%%mode') {
      const stats = await this.resource.getStats();
      const safeMode = parseInt(value, 8) % 0o1000;
      const mode = stats.mode & 0o777000 & safeMode;
      await this.resource.setMode(mode);
      return;
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

      if (this.resource.adapter.pam) {
        const stat = await fsp.stat(this.resource.absolutePath);
        try {
          await fsp.chown(filepath, stat.uid, stat.gid);
        } catch (e: any) {
          // Ignore errors on setting ownership of props file.
        }
      }
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
      'quota-available-bytes': await this.get('quota-available-bytes'),
      'quota-used-bytes': await this.get('quota-used-bytes'),
      'LCGDM:%%mode': await this.get('LCGDM:%%mode'),
      ...(this.resource.adapter.pam
        ? {
            owner: await this.get('owner'),
            group: await this.get('group'),
          }
        : {}),
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
      'quota-available-bytes',
      'quota-used-bytes',
      'LCGDM:%%mode',
      ...(this.resource.adapter.pam ? ['owner', 'group'] : []),
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
