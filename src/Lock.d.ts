import type { User } from './User';

export interface Lock {
  resource: Resource;
  user: User;
  date: Date;
  timeout: number;

  remove(): Promise<boolean>;
}
