import pam from 'authenticate-pam';
import type { User as UserInterface } from 'nephele';
import { UnauthorizedError } from 'nephele';

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
}
