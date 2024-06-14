import type { Properties as PropertiesInterface, User } from 'nephele';
import { PropertyIsProtectedError, PropertyNotFoundError } from 'nephele';

import type Resource from './Resource.js';

export default class Properties implements PropertiesInterface {
  resource: Resource;

  constructor({ resource }: { resource: Resource }) {
    this.resource = resource;
  }

  async get(name: string): Promise<any> {
    const nymphResource = this.resource.nymphResource;

    switch (name) {
      case 'creationdate':
        if (nymphResource.cdate == null) {
          return new Date().toISOString();
        }

        return new Date(nymphResource.cdate).toISOString();
      case 'getcontentlength':
        return `${await this.resource.getLength()}`;
      case 'getcontenttype':
        const mediaType = await this.resource.getMediaType();
        if (mediaType == null) {
          throw new PropertyNotFoundError(
            `${name} property doesn't exist on resource.`,
          );
        }
        return mediaType;
      case 'getetag':
        return await this.resource.getEtag();
      case 'getlastmodified':
        if (nymphResource.mdate == null) {
          return new Date().toUTCString();
        }

        return new Date(nymphResource.mdate).toUTCString();
      case 'resourcetype':
        if (await this.resource.isCollection()) {
          return { collection: {} };
        } else {
          return {};
        }
      case 'supportedlock':
        // This adapter supports exclusive and shared write locks.
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
    }

    if (!(name in nymphResource.properties)) {
      throw new PropertyNotFoundError(
        `${name} property doesn't exist on resource.`,
      );
    }

    return nymphResource.properties[name];
  }

  async getByUser(name: string, _user: User) {
    return await this.get(name);
  }

  async set(name: string, value: string) {
    const errors = await this.runInstructions([['set', name, value]]);

    if (errors != null && errors.length) {
      throw errors[0][1];
    }
  }

  async setByUser(name: string, value: string, user: User) {
    const errors = await this.runInstructionsByUser(
      [['set', name, value]],
      user,
    );

    if (errors != null && errors.length) {
      throw errors[0][1];
    }
  }

  async remove(name: string) {
    const errors = await this.runInstructions([['remove', name, undefined]]);

    if (errors != null && errors.length) {
      throw errors[0][1];
    }
  }

  async removeByUser(name: string, user: User) {
    const errors = await this.runInstructionsByUser(
      [['remove', name, undefined]],
      user,
    );

    if (errors != null && errors.length) {
      throw errors[0][1];
    }
  }

  async runInstructions(instructions: ['set' | 'remove', string, any][]) {
    const nymphResource = this.resource.nymphResource;
    let changed = false;
    let errors: [string, Error][] = [];
    const originalProperties = JSON.parse(
      JSON.stringify(nymphResource.properties ?? {}),
    );

    const errorEverything = (e: Error) => {
      const errProps: { [k: string]: Error } = {};
      for (let instruction of instructions) {
        errProps[instruction[1]] = e;
      }
      nymphResource.properties = originalProperties;
      return Object.entries(errProps);
    };

    for (let instruction of instructions) {
      const [action, name, value] = instruction;

      if (
        [
          'creationdate',
          'getcontentlength',
          'getcontenttype',
          'getetag',
          'getlastmodified',
          'resourcetype',
          'supportedlock',
          'quota-available-bytes',
          'quota-used-bytes',
        ].includes(name)
      ) {
        errors.push([
          name,
          new PropertyIsProtectedError(`${name} is a protected property.`),
        ]);
        continue;
      }

      if (action === 'set') {
        nymphResource.properties[name] = value;
        changed = true;
      } else {
        if (name in nymphResource.properties) {
          delete nymphResource.properties[name];
          changed = true;
        }
      }
    }

    if (errors.length) {
      return errors;
    }

    if (changed) {
      try {
        if (!(await nymphResource.$save())) {
          return errorEverything(new Error("Couldn't save resource entity."));
        }
      } catch (e: any) {
        return errorEverything(e);
      }
    }

    if (errors.length) {
      return errors;
    }
  }

  async runInstructionsByUser(
    instructions: ['set' | 'remove', string, any][],
    _user: User,
  ) {
    return await this.runInstructions(instructions);
  }

  async getAll() {
    const props = { ...(this.resource.nymphResource.properties ?? {}) };

    for (let name of [
      'creationdate',
      'getcontentlength',
      'getcontenttype',
      'getetag',
      'getlastmodified',
      'resourcetype',
      'supportedlock',
      // 'quota-available-bytes', // Intentionally left out, expensive to calculate.
      // 'quota-used-bytes', // Intentionally left out, expensive to calculate.
    ]) {
      try {
        props[name] = await this.get(name);
      } catch (e: any) {
        if (!(e instanceof PropertyNotFoundError)) {
          props[name] = e;
        }
      }
    }

    return props;
  }

  async getAllByUser(_user: User) {
    return await this.getAll();
  }

  async list() {
    return [...(await this.listLive()), ...(await this.listDead())];
  }

  async listByUser(user: User) {
    return [
      ...(await this.listLiveByUser(user)),
      ...(await this.listDeadByUser(user)),
    ];
  }

  async listLive() {
    return [
      'creationdate',
      'getcontentlength',
      'getcontenttype',
      'getetag',
      'getlastmodified',
      'resourcetype',
      'supportedlock',
      'quota-available-bytes',
      'quota-used-bytes',
    ];
  }

  async listLiveByUser(_user: User) {
    return await this.listLive();
  }

  async listDead() {
    return [
      // TODO: Should these be included if they're not defined yet.
      // 'displayname',
      // 'getcontentlanguage',
      ...Object.keys(this.resource.nymphResource.properties || {}),
    ];
  }

  async listDeadByUser(_user: User) {
    return await this.listDead();
  }
}
