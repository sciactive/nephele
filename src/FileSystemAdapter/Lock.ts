import type { Lock as LockInterface } from '../index.js';

import Resource from './Resource.js';
import User from './User.js';

export default class Lock implements LockInterface {
  resource: Resource;
  user: User;
  token: string = '';
  date: Date = new Date();
  timeout: number = 1000 * 60 * 60 * 24 * 2; // Default to two day timeout.
  scope: 'exclusive' | 'shared' = 'exclusive';
  depth: '0' | 'infinity' = '0';
  provisional: boolean = false;
  owner: any = {};

  constructor({ resource, user }: { resource: Resource; user: User }) {
    this.resource = resource;
    this.user = user;
  }

  async save() {
    const meta = await this.resource.readMetadataFile();

    if (meta.locks == null) {
      meta.locks = {};
    }

    meta.locks[this.token] = {
      username: this.user.username,
      date: this.date.getTime(),
      timeout: this.timeout,
      scope: this.scope,
      depth: this.depth,
      provisional: this.provisional,
      owner: this.owner,
    };

    await this.resource.saveMetadataFile(meta);
  }

  async delete() {
    const meta = await this.resource.readMetadataFile();

    if (meta.locks == null || !(this.token in meta.locks)) {
      return;
    }

    delete meta.locks[this.token];

    await this.resource.saveMetadataFile(meta);
  }
}
