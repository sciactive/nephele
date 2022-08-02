import cp from 'node:child_process';
import pam from 'authenticate-pam';

import type { User as UserInterface } from '../index.js';
import { UnauthorizedError } from '../index.js';

import type Adapter from './Adapter.js';

export default class User implements UserInterface {
  username: string;
  adapter: Adapter;
  uidResult: number | undefined = undefined;
  gidResult: number | undefined = undefined;
  gidsResult: number[] | undefined = undefined;

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
    if (this.uidResult) {
      return this.uidResult;
    }

    if (!this.adapter.pam) {
      return -1;
    }

    return await new Promise((resolve, reject) => {
      let id = '';
      const p = cp.spawn('id', ['-u', this.username], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 2000,
      });
      p.stdout.on('data', (data) => {
        id += data;
        // This part here is really bad in a production environment. It results
        // in leaving zombie processes around. I don't know why Node isn't
        // clearing the zombie processes.
        setTimeout(() => {
          if (p.exitCode == null) {
            p.emit('close');
          }
        }, 500);
      });
      p.stderr.on('error', (err) => {
        reject(`${err}`);
      });
      p.on('close', () => {
        this.uidResult = parseInt(id.trim());
        resolve(this.uidResult);
      });
    });
  }

  async getGid(): Promise<number> {
    if (this.gidResult) {
      return this.gidResult;
    }

    if (!this.adapter.pam) {
      return -1;
    }

    return await new Promise((resolve, reject) => {
      let gid = '';
      const p = cp.spawn('id', ['-g', this.username], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 2000,
      });
      p.stdout.on('data', (data) => {
        gid += data;
        // This part here is really bad in a production environment. It results
        // in leaving zombie processes around. I don't know why Node isn't
        // clearing the zombie processes.
        setTimeout(() => {
          if (p.exitCode == null) {
            p.emit('close');
          }
        }, 500);
      });
      p.stderr.on('error', (err) => {
        reject(`${err}`);
      });
      p.on('close', () => {
        this.gidResult = parseInt(gid.trim());
        resolve(this.gidResult);
      });
    });
  }

  async getGids(): Promise<number[]> {
    if (this.gidsResult) {
      return this.gidsResult;
    }

    if (!this.adapter.pam) {
      return [];
    }

    return await new Promise((resolve, reject) => {
      let gids = '';
      const p = cp.spawn('id', ['-G', this.username], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 2000,
      });
      p.stdout.on('data', (data) => {
        gids += data;
        // This part here is really bad in a production environment. It results
        // in leaving zombie processes around. I don't know why Node isn't
        // clearing the zombie processes.
        setTimeout(() => {
          if (p.exitCode == null) {
            p.emit('close');
          }
        }, 500);
      });
      p.stderr.on('error', (err) => {
        reject(err);
      });
      p.on('close', () => {
        this.gidsResult = gids.trim().split(' ').map(parseInt);
        resolve(this.gidsResult);
      });
    });
  }
}
