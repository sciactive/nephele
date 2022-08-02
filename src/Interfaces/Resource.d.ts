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

  /**
   * Put the input stream into the resource.
   *
   * If the resource is a collection, and it can't accept a stream (like a
   * folder on a filesystem), a MethodNotSupportedError may be thrown.
   */
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

  /**
   * Delete the resource.
   *
   * If the resource is a collection, it should only be deleted if it's empty.
   *
   * If the resource doesn't exist, a ResourceNotFoundError should be thrown.
   *
   * If the user doesn't have permission to delete the resource, an
   * UnauthorizedError should be thrown.
   *
   * If no one has permission to delete the resource, a ForbiddenError should be
   * thrown.
   */
  delete(user: User): Promise<void>;

  /**
   * Copy the resource to the destination.
   *
   * If the resource is a collection, do not copy its contents, only its
   * properties.
   *
   * If the resource doesn't exist, a ResourceNotFoundError should be thrown.
   *
   * If the user doesn't have permission to copy the resource, an
   * UnauthorizedError should be thrown.
   *
   * If no one has permission to copy the resource, a ForbiddenError should be
   * thrown.
   *
   * If the destination is outside of this adapter's ability to modify, a
   * BadGatewayError should be thrown.
   *
   * If the destination would be a member of a collection that doesn't exist
   * (like a file in a folder that doesn't exist), a
   * ResourceTreeNotCompleteError should be thrown.
   *
   * If the source and the destination ultimately resolve to the same resource,
   * or the destination falls under the source itself, a ForbiddenError should
   * be thrown.
   */
  copy(destination: URL, baseUrl: string, user: User): Promise<void>;

  /**
   * Move the resource to the destination.
   *
   * This will only be called on non-collection resources. Collection resources
   * will instead by copied, have their contents moved, then be deleted.
   *
   * If the resource doesn't exist, a ResourceNotFoundError should be thrown.
   *
   * If the user doesn't have permission to move the resource, an
   * UnauthorizedError should be thrown.
   *
   * If no one has permission to move the resource, a ForbiddenError should be
   * thrown.
   *
   * If the destination is outside of this adapter's ability to modify, a
   * BadGatewayError should be thrown.
   *
   * If the destination would be a member of a collection that doesn't exist
   * (like a file in a folder that doesn't exist), a
   * ResourceTreeNotCompleteError should be thrown.
   *
   * If the source and the destination ultimately resolve to the same resource,
   * or the destination falls under the source itself, a ForbiddenError should
   * be thrown.
   */
  move(destination: URL, baseUrl: string, user: User): Promise<void>;

  getLength(): Promise<number>;

  getEtag(): Promise<string>;

  /**
   * MIME type.
   *
   * You can use mmmagic if you don't know it.
   */
  getMediaType(): Promise<string>;

  /**
   * The canonical name of the resource. (The basename of its path.)
   */
  getCanonicalName(): Promise<string>;

  /**
   * The canonical path relative to the root of the WebDAV server.
   */
  getCanonicalPath(): Promise<string>;

  /**
   * The canonical URL must be within the WebDAV server's namespace, and must
   * not have query parameters.
   *
   * The server's namespace in the current request is provided as `baseUrl`.
   */
  getCanonicalUrl(baseUrl: URL): Promise<URL>;

  isCollection(): Promise<boolean>;

  /**
   * Get the internal members of the collection.
   *
   * Internal members are the direct descendents (children) of a collection. If
   * this is called on a resource that is not a collection, it should throw a
   * MethodNotSupportedError.
   *
   * If the user doesn't have permission to see the internal members, an
   * UnauthorizedError should be thrown.
   */
  getInternalMembers(user: User): Promise<Resource[]>;
}
