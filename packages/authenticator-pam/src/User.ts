import pam from 'authenticate-pam';
import type { User as UserInterface } from 'nephele';
import { UnauthorizedError } from 'nephele';

export default class User implements UserInterface {
  username: string;

  private authenticated = false;

  constructor({ username }: { username: string }) {
    this.username = username;
  }

  async usernameMapsToSystemUser() {
    // All users map to system users.
    return true;
  }

  async authenticate(password: string) {
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
}
