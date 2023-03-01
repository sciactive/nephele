import type { User as UserInterface } from 'nephele';

export default class User implements UserInterface {
  username: string;
  [k: string]: any;

  constructor({ username }: { username: string }) {
    this.username = username;
  }
}
