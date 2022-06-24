import type { User } from './User.js';

export interface Lock {
  resource: Resource;
  user: User;
  date: Date;
  timeout: number;

  save(): Promise<void>;

  remove(): Promise<void>;
}
