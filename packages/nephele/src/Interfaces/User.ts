export interface User {
  /**
   * Username is required.
   */
  username: string;
  /**
   * The user's primary group's groupname.
   *
   * This is not required, and should not be assumed to exist. This is meant for
   * Unix file system style access control.
   */
  groupname?: string;
  /**
   * The user's ID.
   *
   * This is not required, and should not be assumed to exist. This is meant for
   * Unix file system style access control.
   */
  uid?: number;
  /**
   * The user's primary group's ID.
   *
   * This is not required, and should not be assumed to exist. This is meant for
   * Unix file system style access control.
   */
  gid?: number;
  /**
   * An array of the user's groups' IDs.
   *
   * This is not required, and should not be assumed to exist. This is meant for
   * Unix file system style access control.
   */
  gids?: number[];
}
