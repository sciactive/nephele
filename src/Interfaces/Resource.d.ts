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

  getLength(): Promise<number>;

  getEtag(): Promise<string>;

  /**
   * MIME type.
   *
   * You can use mmmagic if you don't know it.
   */
  getMediaType(): Promise<string>;

  /**
   * The canonical URL must be within the WebDAV server's namespace, and must
   * not have query parameters.
   */
  getCanonicalUrl(): Promise<URL>;

  isCollection(): Promise<boolean>;

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
}

// Notes:
// - Servers MUST ignore the XML attribute xml:space if present and never use it
//   to change whitespace handling. Whitespace in property values is
//   significant.
// - There is a standing convention that when a collection is referred to by its
//   name without a trailing slash, the server MAY handle the request as if the
//   trailing slash were present. In this case, it SHOULD return a
//   Content-Location header in the response, pointing to the URL ending with
//   the "/".
// - Wherever a server produces a URL referring to a collection, the server
//   SHOULD include the trailing slash.
// - A resource becomes directly locked when a LOCK request to a URL of that
//   resource creates a new lock. The "lock-root" of the new lock is that URL.
//   If at the time of the request, the URL is not mapped to a resource, a new
//   empty resource is created and directly locked.
// - If a request causes the lock-root of any lock to become an unmapped URL,
//   then the lock MUST also be deleted by that request.
// - When a locked resource is modified, a server MUST check that the
//   authenticated principal matches the lock creator (in addition to checking
//   for valid lock token submission).
// - A successful MOVE request on a write locked resource MUST NOT move the
//   write lock with the resource.
// - A server receiving a LOCK request with no body MUST NOT create a new
//   lock -- this form of the LOCK request is only to be used to "refresh" an
//   existing lock (meaning, at minimum, that any timers associated with the
//   lock MUST be reset).
// - Servers MUST return authorization errors in preference to other errors.
//   This avoids leaking information about protected resources
