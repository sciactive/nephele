import type { Properties as PropertiesInterface, User } from 'nephele';
import { PropertyIsProtectedError, PropertyNotFoundError } from 'nephele';

import Resource from './Resource.js';

export default class Properties implements PropertiesInterface {
  resource: Resource;

  constructor({ resource }: { resource: Resource }) {
    this.resource = resource;
  }

  async get(name: string) {
    switch (name) {
      case 'creationdate':
        return this.resource.file.properties.creationdate.toISOString();
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
        return this.resource.file.properties.getlastmodified.toUTCString();
      case 'resourcetype':
        if (this.resource.collection) {
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
      case 'owner':
        if ('owner' in this.resource.file.properties) {
          return this.resource.file.properties.owner;
        } else {
          throw new PropertyNotFoundError(
            `${name} property doesn't exist on resource.`,
          );
        }
    }

    if (!(name in this.resource.file.properties)) {
      throw new PropertyNotFoundError(
        `${name} property doesn't exist on resource.`,
      );
    }

    return this.resource.file.properties[name];
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
    let props = JSON.parse(
      JSON.stringify(this.resource.file.properties),
    ) as typeof this.resource.file.properties;
    props.creationdate = this.resource.file.properties.creationdate;
    props.getlastmodified = this.resource.file.properties.getlastmodified;
    let changed = false;
    let errors: [string, Error][] = [];

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
          'owner',
        ].includes(name)
      ) {
        errors.push([
          name,
          new PropertyIsProtectedError(`${name} is a protected property.`),
        ]);
        continue;
      }

      if (action === 'set') {
        props[name] = value;
        changed = true;
      } else if (name in props) {
        delete props[name];
        changed = true;
      }
    }

    if (errors.length) {
      return errors;
    }

    if (changed) {
      this.resource.file.properties = props;
    }
  }

  async runInstructionsByUser(
    instructions: ['set' | 'remove', string, any][],
    _user: User,
  ) {
    return await this.runInstructions(instructions);
  }

  async getAll() {
    const props = { ...this.resource.file.properties };

    for (let name of [
      'creationdate',
      'getcontentlength',
      'getcontenttype',
      'getetag',
      'getlastmodified',
      'resourcetype',
      'supportedlock',
      'owner',
    ]) {
      try {
        props[name] = await this.get(name);
      } catch (e: any) {
        if (!(e instanceof PropertyNotFoundError)) {
          throw e;
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
      'owner',
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
      ...Object.keys(this.resource.file.properties || {}).filter(
        (name) =>
          name !== 'creationdate' &&
          name !== 'getlastmodified' &&
          name !== 'owner',
      ),
    ];
  }

  async listDeadByUser(_user: User) {
    return await this.listDead();
  }
}
