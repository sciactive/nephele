import type { Lock as LockInterface } from 'nephele';

import Resource from './Resource.js';

export default class Lock implements LockInterface {
  resource: Resource;
  token: string = '';
  date: Date = new Date();
  timeout: number = 1000 * 60 * 60 * 24 * 2; // Default to two day timeout.
  scope: 'exclusive' | 'shared' = 'exclusive';
  depth: '0' | 'infinity' = '0';
  provisional: boolean = false;
  owner: any = {};
  username: string;

  constructor({
    resource,
    username,
  }: {
    resource: Resource;
    username: string;
  }) {
    this.resource = resource;
    this.username = username;
  }

  async save() {
    this.resource.file.locks[this.token] = {
      username: this.username,
      date: this.date.getTime(),
      timeout: this.timeout,
      scope: this.scope,
      depth: this.depth,
      provisional: this.provisional,
      owner: this.owner,
    };
  }

  async delete() {
    delete this.resource.file.locks[this.token];
  }
}
