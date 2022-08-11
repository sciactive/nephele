import type { Readable } from 'node:stream';

import type { Adapter } from './Adapter.js';
import type { Lock } from './Lock.js';
import type { Properties } from './Properties.js';
import type { User } from './User.js';

export interface Resource {
  /**
   * The adapter this resource belongs to.
   */
  adapter: Adapter;
  /**
   * The root of the adapter's namespace.
   *
   * This is given to the adapter when the resource is requested.
   */
  baseUrl: URL;

  /**
   * Return any locks currently saved for this resource.
   *
   * This includes any provisional locks.
   *
   * Don't worry about timed out locks. Nephele will check for them and delete
   * them.
   */
  getLocks(): Promise<Lock[]>;

  /**
   * Return any locks currently saved for this resource for the given user.
   *
   * This includes any provisional locks.
   *
   * Don't worry about timed out locks. Nephele will check for them and delete
   * them.
   */
  getLocksByUser(user: User): Promise<Lock[]>;

  /**
   * Create a new lock for this user.
   *
   * The defaults for the lock don't matter. They will be assigned by Nephele
   * before being saved to storage.
   */
  createLockForUser(user: User): Promise<Lock>;

  /**
   * Return a properties object for this resource.
   */
  getProperties(): Promise<Properties>;

  /**
   * Get a readable stream of the content of the resource.
   *
   * If a range is included, the stream should return the requested byte range
   * of the content.
   *
   * If the request is aborted prematurely, `detroy()` will be called on the
   * stream. You should listen for this event and clean up any open file handles
   * or streams.
   */
  getStream(range?: { start: number; end: number }): Promise<Readable>;

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
   * If the resource is a collection, do not copy its contents (internal
   * members), only its properties.
   *
   * This **must not** copy any locks along with the resource.
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
  copy(destination: URL, baseUrl: URL, user: User): Promise<void>;

  /**
   * Move the resource to the destination.
   *
   * This will only be called on non-collection resources. Collection resources
   * will instead by copied, have their contents moved, then be deleted.
   *
   * This **must not** move any locks along with the resource.
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
  move(destination: URL, baseUrl: URL, user: User): Promise<void>;

  /**
   * Return the length, in bytes, of this resource's content (what would be
   * returned from getStream).
   */
  getLength(): Promise<number>;

  /**
   * Return the current ETag for this resource.
   */
  getEtag(): Promise<string>;

  /**
   * MIME type.
   *
   * You can use `mime` or `mmmagic` if you don't know it.
   *
   * If the resource doesn't have a media type (like a folder in a filesystem),
   * return null.
   */
  getMediaType(): Promise<string | null>;

  /**
   * The canonical name of the resource. (The basename of its path.)
   */
  getCanonicalName(): Promise<string>;

  /**
   * The canonical path relative to the root of the adapter.
   *
   * This should **not** be URL encoded.
   */
  getCanonicalPath(): Promise<string>;

  /**
   * The canonical URL must be within the adapter's namespace, and must
   * not have query parameters.
   *
   * The adapter's namespace in the current request is provided to the adapter
   * as `baseUrl` when the resource is requested.
   */
  getCanonicalUrl(): Promise<URL>;

  /**
   * Return whether this resource is a collection.
   */
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
