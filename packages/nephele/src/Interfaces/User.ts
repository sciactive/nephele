export interface User {
  username: string;

  /**
   * Determine whether the user's username maps to a system user.
   */
  usernameMapsToSystemUser(): Promise<boolean>;
}
