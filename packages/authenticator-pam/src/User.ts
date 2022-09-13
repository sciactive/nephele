import pam from 'authenticate-pam';
import userid from 'userid';
import type { User as UserInterface } from 'nephele';
import { ForbiddenError, UnauthorizedError } from 'nephele';

const { ids, groupname, gids } = userid;

export default class User implements UserInterface {
  username: string;
  groupname?: string;
  uid?: number;
  gid?: number;
  gids?: number[];

  private authenticated = false;

  constructor({ username }: { username: string }) {
    this.username = username;
    try {
      const { uid, gid } = ids(username);
      this.uid = uid;
      this.gid = gid;
      this.groupname = groupname(gid);
      this.gids = gids(username);
    } catch (e: any) {
      if (e.message.includes('username not found')) {
        this.uid = undefined;
        this.gid = undefined;
        this.groupname = undefined;
        this.gids = undefined;
      }
    }

    console.log(this);
  }

  async authenticate(password: string, remoteHost: string = 'localhost') {
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
        { serviceName: 'login', remoteHost }
      );
    });
  }

  async checkUID(allowedUIDs: string[]) {
    if (this.uid == null) {
      throw new UnauthorizedError('Unknown user.');
    }

    for (let range of allowedUIDs) {
      const parts = range.split('-');

      if (parts.length < 1 || parts.length > 2) {
        throw new Error('allowedUIDs settings is misconfigured!');
      }

      if (
        (parts.length === 1 && this.uid === parseInt(parts[0])) ||
        (parts.length === 2 &&
          this.uid >= parseInt(parts[0]) &&
          this.uid <= parseInt(parts[1]))
      ) {
        return;
      }
    }

    throw new ForbiddenError('You are not allowed to log in.');
  }
}
