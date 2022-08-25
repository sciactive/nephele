import pam from 'authenticate-pam';
import userid from 'userid';
import type { User as UserInterface } from 'nephele';
import { ForbiddenError, UnauthorizedError } from 'nephele';

const { uid } = userid;

export default class User implements UserInterface {
  username: string;

  private authenticated = false;

  constructor({ username }: { username: string }) {
    this.username = username;
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
    const id = uid(this.username);

    for (let range of allowedUIDs) {
      const parts = range.split('-');

      if (parts.length < 1 || parts.length > 2) {
        throw new Error('allowedUIDs settings is misconfigured!');
      }

      if (
        (parts.length === 1 && id === parseInt(parts[0])) ||
        (parts.length === 2 &&
          id >= parseInt(parts[0]) &&
          id <= parseInt(parts[1]))
      ) {
        return;
      }
    }

    throw new ForbiddenError('You are not allowed to log in.');
  }
}
