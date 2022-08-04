import type { User } from './User.js';

export interface Properties {
  /**
   * Get a property's value.
   *
   * This function should usually return a string. If not, it MUST return an
   * object that represents an XML structure that can be understood by xml2js,
   * or an array of such objects.
   *
   * If the property doesn't exist, this should throw a PropertyNotFoundError.
   *
   * WebDAV requires support for the following properties, all in the
   * DAV: XML namespace.
   *
   * - creationdate
   * - displayname
   * - getcontentlanguage
   * - getcontentlength
   * - getcontenttype
   * - getetag
   * - getlastmodified
   * - resourcetype
   * - supportedlock
   *
   * The following property is handled by Nephele.
   *
   * - lockdiscovery
   *
   * Any property not in the DAV: namespace will have its namespace and the
   * string '%%' prepended to its name, like "LCGDM:%%mode".
   */
  get(name: string): Promise<string | Object | Object[] | undefined>;
  getByUser(
    name: string,
    user: User
  ): Promise<string | Object | Object[] | undefined>;

  /**
   * Set a property's value.
   *
   * This function should support setting a string value, but also MUST support
   * setting an object value that represents an XML structure that can be
   * understood by xml2js, or an array of such objects.
   *
   * If a property is protected, this function should throw a
   * PropertyIsProtectedError.
   *
   * The following properties should be protected, according to the WebDAV spec:
   *
   * - creationdate
   * - getcontentlength
   * - getcontenttype
   * - getetag
   * - getlastmodified
   * - resourcetype
   * - supportedlock
   *
   * The following property is handled by Nephele.
   *
   * - lockdiscovery
   */
  set(
    name: string,
    value: string | Object | Object[] | undefined
  ): Promise<void>;
  setByUser(
    name: string,
    value: string | Object | Object[] | undefined,
    user: User
  ): Promise<void>;

  /**
   * Completely remove a property.
   */
  remove(name: string): Promise<void>;
  removeByUser(name: string, user: User): Promise<void>;

  /**
   * Perform the given instructions, atomically.
   *
   * Either all instructions should succeed, or no instructions should succeed.
   * Practically, this means that in the event of any failure at all, this
   * function should return errors for any instruction(s) that failed, and no
   * change to any of the properties should take place.
   *
   * Do not throw errors in this function. Instead, return an array of error
   * arrays. Error arrays contain the name of the property that caused the error
   * and the Error that would have been thrown.
   *
   * An instruction is an array that contains exactly three elements:
   *
   * - An action, 'set', meaning to set the property, or 'remove', meaning to
   *   remove the property.
   * - The name of the property.
   * - The value of the property if it is being set, or `undefined` if it is
   *   being removed.
   */
  runInstructions(
    instructions: ['set' | 'remove', string, any][]
  ): Promise<undefined | [string, Error][]>;
  runInstructionsByUser(
    instructions: ['set' | 'remove', string, any][],
    user: User
  ): Promise<undefined | [string, Error][]>;

  /**
   * Return all the defined properties.
   *
   * This doesn't need to return all live properties. You can choose to leave
   * out properties that are expensive to calculate.
   *
   * The following property is handled by Nephele, and it is automatically
   * included if your adapter supports locks, indicated by returning compliance
   * class "2".
   *
   * - lockdiscovery
   */
  getAll(): Promise<{ [k: string]: string | Object | Object[] }>;
  getAllByUser(
    user: User
  ): Promise<{ [k: string]: string | Object | Object[] }>;

  /**
   * Return the names of all properties.
   *
   * The following property is handled by Nephele, and it is automatically
   * included if your adapter supports locks, indicated by returning compliance
   * class "2".
   *
   * - lockdiscovery
   */
  list(): Promise<string[]>;
  listByUser(user: User): Promise<string[]>;
  listLive(): Promise<string[]>;
  listLiveByUser(user: User): Promise<string[]>;
  listDead(): Promise<string[]>;
  listDeadByUser(user: User): Promise<string[]>;
}
