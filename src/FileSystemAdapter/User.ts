import pam from 'authenticate-pam';
import userid from 'userid';

import type { User as UserInterface } from '../index.js';
import { UnauthorizedError } from '../index.js';

import type Adapter from './Adapter.js';

const { uid, ids, gids } = userid;

export default class User implements UserInterface {
  username: string;
  adapter: Adapter;

  private authenticated = false;

  constructor({ username, adapter }: { username: string; adapter: Adapter }) {
    this.username = username;
    this.adapter = adapter;
  }

  async authenticate(password: string) {
    if (!this.adapter.pam) {
      this.authenticated = true;
      return;
    }
    if (this.authenticated) {
      return;
    }

    return await new Promise<void>((resolve, reject) => {
      pam.authenticate(
        this.username,
        password,
        (err?: string) => {
          if (err) {
            reject(new UnauthorizedError(err));
          } else {
            this.authenticated = true;
            resolve();
          }
        },
        { serviceName: 'login', remoteHost: 'localhost' }
      );
    });
  }

  async getUid(): Promise<number> {
    if (!this.adapter.pam) {
      return -1;
    }

    return uid(this.username);
  }

  async getGid(): Promise<number> {
    if (!this.adapter.pam) {
      return -1;
    }

    return ids(this.username).gid;
  }

  async getGids(): Promise<number[]> {
    if (!this.adapter.pam) {
      return [];
    }

    return gids(this.username);
  }
}
