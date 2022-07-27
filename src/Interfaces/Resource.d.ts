import type { Readable } from 'node:stream';

import type { Lock } from './Lock.js';
import type { Properties } from './Properties.js';
import type { User } from './User.js';

export interface Resource {
  /**
   * Return any locks that apply to this resource, including any lock for
   * collection resources that contain this resource where the lock has a depth
   * such that this resource is included.
   *
   * A depth 1 lock applies to a collection and its immediate children, while a
   * depth infinity lock applies to a collection and all of its descendents.
   */
  getLocks(): Promise<Lock[]>;

  /**
   * Return any locks that apply to this resource and were issued to the given
   * user, including any lock for collection resources that contain this
   * resource where the lock has a depth such that this resource is included.
   *
   * A depth 1 lock applies to a collection and its immediate children, while a
   * depth infinity lock applies to a collection and all of its descendents.
   */
  getLocksByUser(user: User): Promise<Lock[]>;

  getProperties(): Promise<Properties>;

  // /**
  //  * Note: This can be dangerous to use, since the body could be gigabytes in length.
  //  */
  // getBody(): Promise<Buffer | string>;
  // setBody(input: Buffer | string): Promise<void>;

  getStream(): Promise<Readable>;
  setStream(input: Readable, user: User): Promise<void>;

  /**
   * Create the resource.
   *
   * If the resource is a collection, the collection should be created normally.
   *
   * If the resource is not a collection, the resource should be created as an
   * empty resource. This probably means a lock is being created for the
   * resource.
   *
   * If the resource already exists, a ResourceExistsError should be thrown.
   */
  create(user: User): Promise<void>;

  getLength(): Promise<number>;

  getEtag(): Promise<string>;

  /**
   * MIME type.
   *
   * You can use mmmagic if you don't know it.
   */
  getMediaType(): Promise<string>;

  /**
   * The canonical path relative to the root of the WebDAV server.
   */
  getCanonicalPath(): Promise<string>;

  /**
   * The canonical URL must be within the WebDAV server's namespace, and must
   * not have query parameters.
   */
  getCanonicalUrl(): Promise<URL>;

  isCollection(): Promise<boolean>;

  /**
   * Get the internal members of the collection.
   *
   * Internal members are the direct descendents (children) of a collection. If
   * this is called on a resource that is not a collection, it should throw a
   * MethodNotSupportedError.
   */
  getInternalMembers(): Promise<Resource[]>;
}
