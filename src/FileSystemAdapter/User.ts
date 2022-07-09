import cp from 'node:child_process';
import pam from 'authenticate-pam';

import type { User as UserInterface } from '../index.js';
import { UnauthorizedError } from '../index.js';

import type Adapter from './Adapter.js';

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

    return await new Promise((resolve, reject) => {
      let id = '';
      const p = cp.spawn('id', ['-u', this.username]);
      p.stdout.on('data', (data) => {
        id += data;
      });
      p.stderr.on('error', (err) => {
        reject(`${err}`);
      });
      p.on('close', () => {
        resolve(parseInt(id.trim()));
      });
    });
  }

  async getGid(): Promise<number> {
    if (!this.adapter.pam) {
      return -1;
    }

    return await new Promise((resolve, reject) => {
      let gid = '';
      const p = cp.spawn('id', ['-g', this.username]);
      p.stdout.on('data', (data) => {
        gid += data;
      });
      p.stderr.on('error', (err) => {
        reject(`${err}`);
      });
      p.on('close', () => {
        resolve(parseInt(gid.trim()));
      });
    });
  }

  async getGids(): Promise<number[]> {
    if (!this.adapter.pam) {
      return [];
    }

    return await new Promise((resolve, reject) => {
      let gids = '';
      const p = cp.spawn('id', ['-G', this.username]);
      p.stdout.on('data', (data) => {
        gids += data;
      });
      p.stderr.on('error', (err) => {
        reject(err);
      });
      p.on('close', () => {
        resolve(gids.trim().split(' ').map(parseInt));
      });
    });
  }
}
