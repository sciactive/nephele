import { InternalServerError, type Lock as LockInterface } from 'nephele';

import {
  Lock as NymphLock,
  LockData as NymphLockData,
} from './entities/Lock.js';

import Resource from './Resource.js';

export default class Lock implements LockInterface {
  resource: Resource;
  nymphLock: NymphLock & NymphLockData;

  get token() {
    return this.nymphLock.token;
  }
  set token(value: string) {
    this.nymphLock.token = value;
  }

  get date() {
    return new Date(this.nymphLock.date);
  }
  set date(value: Date) {
    this.nymphLock.date = value.getTime();
  }

  get timeout() {
    return this.nymphLock.timeout;
  }
  set timeout(value: number) {
    this.nymphLock.timeout = value;
  }

  get scope() {
    return this.nymphLock.scope;
  }
  set scope(value: 'exclusive' | 'shared') {
    this.nymphLock.scope = value;
  }

  get depth() {
    return this.nymphLock.depth;
  }
  set depth(value: '0' | 'infinity') {
    this.nymphLock.depth = value;
  }

  get provisional() {
    return this.nymphLock.provisional;
  }
  set provisional(value: boolean) {
    this.nymphLock.provisional = value;
  }

  get owner() {
    return this.nymphLock.owner;
  }
  set owner(value: any) {
    this.nymphLock.owner = value;
  }

  get username() {
    return this.nymphLock.username;
  }
  set username(value: string) {
    this.nymphLock.username = value;
  }

  constructor({
    resource,
    nymphLock,
  }: {
    resource: Resource;
    nymphLock: NymphLock & NymphLockData;
  }) {
    this.resource = resource;
    this.nymphLock = nymphLock;
  }

  async save() {
    if (!(await this.nymphLock.$save())) {
      throw new InternalServerError("Couldn't save lock.");
    }
  }

  async delete() {
    if (!(await this.nymphLock.$deleteSkipAC())) {
      throw new InternalServerError("Couldn't delete lock.");
    }
  }
}
