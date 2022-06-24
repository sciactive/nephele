import type { User } from './User.js';

export interface Properties {
  get(name: string): Promise<string>;
  set(name: string, value: string): Promise<void>;

  getByUser(name: string, user: User): Promise<string>;
  setByUser(name: string, value: string, user: User): Promise<void>;

  list(): Promise<string[]>;
  listLive(): Promise<string[]>;
  listDead(): Promise<string[]>;
}
