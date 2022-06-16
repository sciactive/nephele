import type { Resource } from './Resource';
import type { User } from './User';

export interface Cache {
  get(key: string): Promise<string>;
  add(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;

  getFromResource(resource: Resource, key: string): Promise<string>;
  addToResource(resource: Resource, key: string, value: string): Promise<void>;
  removeFromResource(resource: Resource, key: string): Promise<void>;

  getFromUser(user: User, key: string): Promise<string>;
  addToUser(user: User, key: string, value: string): Promise<void>;
  removeFromUser(user: User, key: string): Promise<void>;
}
