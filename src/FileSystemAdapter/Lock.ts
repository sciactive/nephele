import type { Lock as LockInterface } from '../index.js';

import Resource from './Resource.js';
import User from './User.js';

export default class Lock implements LockInterface {
  resource: Resource;
  user: User;
  date: Date;
  timeout: number;
  guid: string;
  depth: '0' | 'infinity';

  constructor({
    resource,
    user,
    date,
    timeout,
    guid,
    depth,
  }: {
    resource: Resource;
    user: User;
    date: Date;
    timeout: number;
    guid: string;
    depth: '0' | 'infinity';
  }) {
    this.resource = resource;
    this.user = user;
    this.date = date;
    this.timeout = timeout;
    this.guid = guid;
    this.depth = depth;
  }

  async save() {
    return;
  }

  async remove() {
    return;
  }
}
