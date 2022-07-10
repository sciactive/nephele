import type { User } from './User.js';

export interface Properties {
  /**
   * Get a property's value.
   *
   * This function should usually return a string. If not, it MUST return an
   * object that represents an XML structure that can be understood by xml2js,
   * or an array of such objects.
   *
   * If the property doesn't exist, this should return undefined.
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
   * - lockdiscovery
   * - resourcetype
   * - supportedlock
   */
  get(name: string): Promise<string | Object | Object[] | undefined>;
  /**
   * Set a property's value.
   *
   * This function should support setting a string value, but also MUST support
   * setting an object value that represents an XML structure that can be
   * understood by xml2js, or an array of such objects.
   *
   * If value is undefined, it doesn't need to be saved into storage. It can
   * instead be removed.
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
   * - lockdiscovery
   * - resourcetype
   * - supportedlock
   */
  set(
    name: string,
    value: string | Object | Object[] | undefined
  ): Promise<void>;

  getByUser(
    name: string,
    user: User
  ): Promise<string | Object | Object[] | undefined>;
  setByUser(
    name: string,
    value: string | Object | Object[] | undefined,
    user: User
  ): Promise<void>;

  /**
   * Return all the defined properties.
   *
   * This doesn't need to return all live properties. You can choose to leave
   * out properties that are expensive to calculate.
   */
  getAll(): Promise<{ [k: string]: string | Object | Object[] }>;
  getAllByUser(
    user: User
  ): Promise<{ [k: string]: string | Object | Object[] }>;

  list(): Promise<string[]>;
  listLive(): Promise<string[]>;
  listDead(): Promise<string[]>;
}
