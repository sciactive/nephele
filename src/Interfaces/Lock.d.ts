import type { User } from './User.js';

export interface Lock {
  resource: Resource;
  user: User;
  date: Date;
  timeout: number;
  guid: string;
  /**
   * A depth '0' lock prevents only the resource itself from being modified. A
   * depth 'infinity' lock prevents the resource and all of its members from
   * being modified.
   */
  depth: '0' | 'infinity';

  save(): Promise<void>;

  remove(): Promise<void>;
}
