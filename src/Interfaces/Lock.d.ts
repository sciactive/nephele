import type { User } from './User.js';

export interface Lock {
  /**
   * A unique token representing this lock.
   */
  token: string;
  /**
   * The date at which the provisional lock was created, the real lock was
   * granted, or the lock was refreshed.
   */
  date: Date;
  /**
   * The number of milliseconds from `date` at which the lock will expire.
   *
   * Note that timeouts in WebDAV are requested and reported in seconds, not
   * milliseconds. Nephele translates these values to milliseconds.
   */
  timeout: number;
  /**
   * Whether this is an exclusive or shared lock.
   *
   * Exclusive locks mean that only the principal of this lock can perform
   * privileged actions. Shared locks mean that any principal who has a shared
   * lock can perform privileged actions. Shared locks are still unique, in that
   * every principal has their own unique lock token.
   */
  scope: 'exclusive' | 'shared';
  /**
   * A depth '0' lock prevents only the resource itself from being modified. A
   * depth 'infinity' lock prevents the resource and all of its members from
   * being modified.
   */
  depth: '0' | 'infinity';
  /**
   * A provisional lock is saved before checking whether the lock can actually
   * be granted, since it may take some time to check through the entire subtree
   * for conflicting locks before the lock can be granted.
   *
   * When a provisional lock is found that would conflict with a lock being
   * requested, the server will wait for a few moments before trying again. Once
   * the provisional lock has either been granted or denied, the lock request
   * will proceed.
   *
   * Provisional locks will not prevent modifications, since they have
   * technically not yet been granted.
   */
  provisional: boolean;
  /**
   * The owner, provided by the user who requested the lock.
   *
   * This will be an XML object, presumably with information about how to
   * contact the owner of the lock.
   */
  owner: any;

  /**
   * Save the lock to storage.
   *
   * It should save all of the properties of the lock defined above, as well as
   * the user who requested the lock (the lock's principal). A lock saved to
   * storage doesn't necessarily mean it's granted. If it is provisional,
   * whether it can be granted is still being assessed.
   *
   * The timeout for a provisional lock will be substantially shorter than the
   * timeout for a real lock. Timeouts for both should be considered a genuine
   * way to tell whether the lock is expired.
   *
   * If the lock is not valid for the resource, a BadRequestError should be
   * thrown.
   */
  save(): Promise<void>;

  /**
   * Delete the lock from storage.
   */
  delete(): Promise<void>;
}
