import type { Lock as LockInterface } from '../index.js';

import Resource from './Resource.js';
import User from './User.js';

export default class Lock implements LockInterface {
  resource: Resource;
  user: User;
  date: Date;
  timeout: number;

  constructor({
    resource,
    user,
    date,
    timeout,
  }: {
    resource: Resource;
    user: User;
    date: Date;
    timeout: number;
  }) {
    this.resource = resource;
    this.user = user;
    this.date = date;
    this.timeout = timeout;
  }

  async save() {
    return;
  }

  async remove() {
    return;
  }
}
