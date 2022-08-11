import zlib from 'node:zlib';
import { pipeline, Readable } from 'node:stream';
import path from 'node:path';
import type { Request } from 'express';
import * as xml2js from 'xml2js';
import contentType from 'content-type';
import splitn from '@sciactive/splitn';
import vary from 'vary';

import type {
  AuthResponse,
  Lock,
  Resource,
  User,
} from '../Interfaces/index.js';
import {
  BadRequestError,
  EncodingNotSupportedError,
  MediaTypeNotSupportedError,
  MethodNotSupportedError,
  PreconditionFailedError,
  ResourceNotFoundError,
  ResourceNotModifiedError,
  UnauthorizedError,
} from '../Errors/index.js';
import type { Options } from '../Options.js';
import { getAdapter } from '../Options.js';

// The following regexes are used in parsing the If header.

// This regex matches a resource: </resource>
const matchResource = /^<.+?>\s*/;
// This regex matches a list of conditions: (<urn:uuid:some-uuid> ["etag"] ["etagwith(parens)"])
const matchList = /^\([^\)]+?(?:"[^"]+"[^\)]*?)*\)\s*/;
// This regex matches the Not keyword of a condition: Not "etag"
const matchNot = /^Not\s*/;
// This regex matches the no-lock condition: <DAV:no-lock>
const matchNolock = /^<DAV:no-lock>\s*/;
// This regex matches a token condition: <urn:uuid:some-uuid>
// Note that it will also match a no-lock condition, so check no-lock first.
const matchToken = /^<[^>]+>\s*/;
// This regex matches an etag condition: ["etag"]
const matchEtag = /^\[(?:W\/)?"[^"]+"\]\s*/;

type IfHeaderList = {
  tokens: string[];
  etags: string[];
  nolock: boolean;
  notTokens: string[];
  notEtags: string[];
  notNolock: boolean;
};

export class Method {
  opts: Options;

  DEV = process.env.NODE_ENV !== 'production';

  xmlParser = new xml2js.Parser({
    xmlns: true,
  });
  xmlBuilder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    ...(this.DEV
      ? {
          renderOpts: {
            pretty: true,
          },
        }
      : {
          renderOpts: {
            indent: '',
            newline: '',
            pretty: false,
          },
        }),
  });

  constructor(opts: Options) {
    this.opts = opts;
  }

  /**
   * You should reimplement this function in your class to handle the method.
   */
  async run(request: Request, _response: AuthResponse) {
    throw new MethodNotSupportedError(
      `${request.method} is not supported on this server.`
    );
  }

  /**
   * Check that the user is authorized to run the method.
   *
   * @param method This will be pulled from the request if not provided.
   * @param url This will be pulled from the request if not provided.
   */
  async checkAuthorization(
    request: Request,
    response: AuthResponse,
    method?: string,
    url?: URL
  ) {
    // If the adapter says it can handle the method, just handle the
    // authorization and error handling for it.
    if (
      !(await response.locals.adapter.isAuthorized(
        url ||
          new URL(request.url, `${request.protocol}://${request.headers.host}`),
        method || request.method,
        response.locals.baseUrl,
        response.locals.user
      ))
    ) {
      throw new UnauthorizedError('Unauthorized.');
    }
  }

  async getAdapter(response: AuthResponse, unencodedPath: string) {
    const { adapter } = getAdapter(
      unencodedPath.replace(/\/?$/, () => '/'),
      response.locals.adapterConfig
    );
    return adapter;
  }

  async getAdapterBaseUrl(response: AuthResponse, unencodedPath: string) {
    const { baseUrl } = getAdapter(
      unencodedPath.replace(/\/?$/, () => '/'),
      response.locals.adapterConfig
    );
    return baseUrl;
  }

  /**
   * Determine if a URL is for the root resource of an adapter.
   */
  async isAdapterRoot(request: Request, response: AuthResponse, url: URL) {
    if (
      url.pathname.replace(/\/?$/, () => '/') ===
      request.baseUrl.replace(/\/?$/, () => '/')
    ) {
      return true;
    }

    const absoluteResource = await response.locals.adapter.getResource(
      new URL(url.toString().replace(/\/?$/, () => '/')),
      response.locals.baseUrl
    );

    const resourceAdapter = await this.getAdapter(
      response,
      decodeURI(
        (
          await absoluteResource.getCanonicalUrl()
        ).pathname.substring(request.baseUrl.length)
      )
    );

    const parentAdapter = await this.getAdapter(
      response,
      decodeURI(
        path.dirname(
          (
            await absoluteResource.getCanonicalUrl()
          ).pathname.substring(request.baseUrl.length)
        )
      )
    );

    return resourceAdapter !== parentAdapter;
  }

  /**
   * Return the collection of which the given resource is an internal member.
   *
   * Returns `undefined` if the resource is the root of the entire Nephele
   * WebDAV server.
   *
   * Note that the resource returned from this function may exist on a different
   * adapter than the resource given to it, and thus the resource returned may
   * not include the resource given in `getInternalMembers`.
   */
  async getParentResource(
    request: Request,
    response: AuthResponse,
    resource: Resource
  ) {
    const url = await resource.getCanonicalUrl();

    if (url.pathname === '/' || url.pathname === request.baseUrl) {
      return undefined;
    }

    const parentPath = decodeURI(path.dirname(url.pathname));
    const { adapter: parentAdapter, baseUrl: parentBaseUrl } = getAdapter(
      parentPath.replace(/\/?$/, () => '/'),
      response.locals.adapterConfig
    );
    const splitPath = url.pathname.replace(/\/?$/, '').split('/');
    const newPath = splitPath
      .slice(0, -1)
      .join('/')
      .replace(/\/?$/, () => '/');

    if (!newPath.startsWith(request.baseUrl.replace(/\/?$/, () => '/'))) {
      // If the new path is outside of the server's basepath, return undefined.
      return undefined;
    }

    return await parentAdapter.getResource(
      new URL(newPath, `${request.protocol}://${request.headers.host}`),
      new URL(
        path.join(request.baseUrl || '/', parentBaseUrl),
        `${request.protocol}://${request.headers.host}`
      )
    );
  }

  async removeAndDeleteTimedOutLocks(locks: Lock[]) {
    const currentLocks: Lock[] = [];

    for (let lock of locks) {
      if (lock.date.getTime() + lock.timeout <= new Date().getTime()) {
        try {
          await lock.delete();
        } catch (e: any) {
          // Ignore errors deleting timed out locks.
        }
      } else {
        currentLocks.push(lock);
      }
    }

    return currentLocks;
  }

  async getCurrentResourceLocks(resource: Resource) {
    const locks = await resource.getLocks();
    return await this.removeAndDeleteTimedOutLocks(locks);
  }

  async getCurrentResourceLocksByUser(resource: Resource, user: User) {
    const locks = await resource.getLocksByUser(user);
    return await this.removeAndDeleteTimedOutLocks(locks);
  }

  private async getLocksGeneral(
    request: Request,
    response: AuthResponse,
    resource: Resource,
    getLocks: (resource: Resource) => Promise<Lock[]>
  ) {
    const resourceLocks = await getLocks(resource);
    const locks: {
      all: Lock[];
      resource: Lock[];
      depthZero: Lock[];
      depthInfinity: Lock[];
    } = {
      all: [...resourceLocks],
      resource: resourceLocks,
      depthZero: [],
      depthInfinity: [],
    };

    let parent = await this.getParentResource(request, response, resource);
    let firstLevelParent = true;
    while (parent) {
      const parentLocks = await getLocks(parent);

      for (let lock of parentLocks) {
        if (lock.depth === 'infinity') {
          locks.depthInfinity.push(lock);
          locks.all.push(lock);
        } else if (firstLevelParent && lock.depth === '0') {
          locks.depthZero.push(lock);
          locks.all.push(lock);
        }
      }

      parent = await this.getParentResource(request, response, parent);
      firstLevelParent = false;
    }

    return locks;
  }

  async getLocks(request: Request, response: AuthResponse, resource: Resource) {
    return await this.getLocksGeneral(
      request,
      response,
      resource,
      async (resource: Resource) =>
        (
          await this.getCurrentResourceLocks(resource)
        ).filter((lock) => !lock.provisional)
    );
  }

  async getLocksByUser(
    request: Request,
    response: AuthResponse,
    resource: Resource,
    user: User
  ) {
    return await this.getLocksGeneral(
      request,
      response,
      resource,
      async (resource: Resource) =>
        (
          await this.getCurrentResourceLocksByUser(resource, user)
        ).filter((lock) => !lock.provisional)
    );
  }

  async getProvisionalLocks(
    request: Request,
    response: AuthResponse,
    resource: Resource
  ) {
    return await this.getLocksGeneral(
      request,
      response,
      resource,
      async (resource: Resource) =>
        (
          await this.getCurrentResourceLocks(resource)
        ).filter((lock) => lock.provisional)
    );
  }

  /**
   * Check if the user has permission to modify the resource, taking into
   * account the set of locks they have submitted.
   *
   * Returns 0 if the user has no permissions to modify this resource or any
   * resource this one may contain. (Directly locked or depth infinity locked.)
   *
   * Returns 1 if this resource is within a collection and the user has no
   * permission to modify the mapping of the internal members of the collection,
   * but it can modify the contents of members. This means the user cannot
   * create, move, or delete the resource, but can change its contents. (Depth 0
   * locked.)
   *
   * Returns 2 if the user has full permissions to modify this resource (either
   * it is not locked or the user owns the lock and has provided it).
   *
   * Returns 3 if the user does not have full permission to modify this
   * resource, but does have permission to lock it with a shared lock. This is
   * only returned if `request.method === 'LOCK'`.
   *
   * @param request The request to check the lock permission for.
   * @param resource The resource to check.
   * @param user The user to check.
   */
  async getLockPermission(
    request: Request,
    response: AuthResponse,
    resource: Resource,
    user: User
  ): Promise<0 | 1 | 2 | 3> {
    const locks = await this.getLocks(request, response, resource);
    const lockTokens = this.getRequestLockTockens(request);

    if (!locks.all.length) {
      return 2;
    }

    const userLocks = await this.getLocksByUser(
      request,
      response,
      resource,
      user
    );
    const lockTokenSet = new Set(lockTokens);

    if (userLocks.all.find((userLock) => lockTokenSet.has(userLock.token))) {
      // The user owns the lock and has submitted it.
      return 2;
    }

    if (request.method === 'LOCK') {
      let code: 0 | 3 = 0;

      for (let lock of locks.resource) {
        if (lock.scope === 'exclusive') {
          return 0;
        } else if (lock.scope === 'shared') {
          code = 3;
        }
      }

      for (let lock of locks.depthInfinity) {
        if (lock.scope === 'exclusive') {
          return 0;
        } else if (lock.scope === 'shared') {
          code = 3;
        }
      }

      for (let lock of locks.depthZero) {
        if (lock.scope === 'exclusive') {
          return 1;
        } else if (lock.scope === 'shared') {
          code = 3;
        }
      }

      return code;
    } else {
      if (locks.depthInfinity.length || locks.resource.length) {
        return 0;
      }

      if (locks.depthZero.length) {
        return 1;
      }

      return 0;
    }
  }

  /**
   * Extract the submitted lock tokens.
   *
   * Note that this is different than checking the conditional "If" header. That
   * must be done separately from checking submitted lock tokens.
   */
  getRequestLockTockens(request: Request) {
    const lockTokens: string[] = [];
    const ifHeader = request.get('If') || '';

    const matches = ifHeader.match(
      /<urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}>/g
    );

    if (matches) {
      for (let match of matches) {
        lockTokens.push(match.slice(1, -1));
      }
    }

    return lockTokens;
  }

  /**
   * Parse and check the If header against existing resources.
   */
  private async checkIfHeader(request: Request, response: AuthResponse) {
    let ifHeader = request.get('If')?.trim().replace(/\n/g, ' ');

    if (ifHeader == null) {
      return;
    }

    if (ifHeader === '') {
      throw new BadRequestError(
        'The If header, if provided, must not be empty.'
      );
    }

    const requestURL = this.getRequestUrl(request);

    // Parse the If header into a usable object.

    const parsedHeader: {
      [resourceUri: string]: IfHeaderList[];
    } = {};

    let currentResource = requestURL.toString();
    const startedWithResource = ifHeader.startsWith('<');
    while (ifHeader.length) {
      const resourceMatch = ifHeader.match(matchResource);
      const listMatch = ifHeader.match(matchList);

      if (resourceMatch) {
        if (!startedWithResource) {
          throw new BadRequestError(
            'Tagged-lists and no-tag-lists must not be mixed in the If header.'
          );
        }

        const resource = resourceMatch[0].trim();
        currentResource = resource.slice(1, -1);
        if (currentResource.match(/(?:^\/)\.\.?(?:$|\/)/)) {
          throw new BadRequestError(
            'Resource URIs in the If header must not contain dot segments.'
          );
        }
        ifHeader = ifHeader.replace(matchResource, '');
      } else if (listMatch) {
        let list = listMatch[0].trim().slice(1, -1).trim();
        const listObj: IfHeaderList = {
          tokens: [],
          etags: [],
          nolock: false,
          notTokens: [],
          notEtags: [],
          notNolock: false,
        };

        if (list === '') {
          throw new BadRequestError(
            'All lists in the If header must have at least one condition.'
          );
        }

        while (list.length) {
          const notMatch = list.match(matchNot);
          if (notMatch) {
            list = list.replace(matchNot, '');
          }

          const nolockMatch = list.match(matchNolock);
          const tokenMatch = list.match(matchToken);
          const etagMatch = list.match(matchEtag);

          if (nolockMatch) {
            if (notMatch) {
              listObj.notNolock = true;
            } else {
              listObj.nolock = true;
            }
            list = list.replace(matchNolock, '');
          } else if (tokenMatch) {
            let token = tokenMatch[0].trim().slice(1, -1);
            if (notMatch) {
              listObj.notTokens.push(token);
            } else {
              listObj.tokens.push(token);
            }
            list = list.replace(matchToken, '');
          } else if (etagMatch) {
            let etag = etagMatch[0]
              .trim()
              .replace(/^\[(?:W\/)?"/, '')
              .slice(0, -2);
            if (notMatch) {
              listObj.notEtags.push(etag);
            } else {
              listObj.etags.push(etag);
            }
            list = list.replace(matchEtag, '');
          } else {
            // Unparseable header.
            throw new BadRequestError(
              "The server doesn't recognize the submitted If header."
            );
          }
        }

        if (!parsedHeader[currentResource]) {
          parsedHeader[currentResource] = [];
        }

        parsedHeader[currentResource].push(listObj);

        ifHeader = ifHeader.replace(matchList, '');
      } else {
        // Unparseable header.
        throw new BadRequestError(
          "The server doesn't recognize the submitted If header."
        );
      }
    }

    if (Object.keys(parsedHeader).length === 0) {
      throw new BadRequestError(
        'The If header, if provided, must contain at least one list with a condition.'
      );
    }

    // Now evaluate the parsed header and check for a single list that passes.
    // The spec states that the entire header evaluates to true if a single list
    // production evaluates to true.
    for (let [resourceUri, lists] of Object.entries(parsedHeader)) {
      const url = new URL(resourceUri, requestURL);
      let etag = '';
      let tokens: string[] = [];

      const [needEtag, needTokens] = lists.reduce(
        ([needEtag, needTokens], list) => [
          !!(needEtag || list.etags.length || list.notEtags.length),
          !!(needTokens || list.tokens.length || list.notTokens.length),
        ],
        [false, false]
      );

      if (needEtag || needTokens) {
        try {
          await this.checkAuthorization(request, response, 'GET', url);
          const { adapter, baseUrl } = getAdapter(
            decodeURI(url.pathname).replace(/\/?$/, () => '/'),
            response.locals.adapterConfig
          );
          const resource = await adapter.getResource(
            url,
            new URL(
              `${request.protocol}://${request.headers.host}${path.join(
                request.baseUrl || '/',
                baseUrl
              )}`
            )
          );
          if (needEtag) {
            etag = await resource.getEtag();
          }
          if (needTokens) {
            tokens = (await this.getLocks(request, response, resource)).all.map(
              (lock) => lock.token
            );
          }
        } catch (e: any) {
          if (e instanceof UnauthorizedError) {
            throw new PreconditionFailedError('If header check failed.');
          }
          if (!(e instanceof ResourceNotFoundError)) {
            throw e;
          }
        }
      }

      listLoop: for (let list of lists) {
        // For each list, all conditions in the list must evaluate to true for
        // that list to evaluate to true.
        if (list.nolock) {
          // No resoure can be locked with <DAV:no-lock>, so this list evaluates
          // to false.
          continue;
        }

        for (let curEtag of list.etags) {
          if (etag === '' || etag !== curEtag) {
            continue listLoop;
          }
        }

        for (let curEtag of list.notEtags) {
          if (etag !== '' && etag === curEtag) {
            continue listLoop;
          }
        }

        for (let curToken of list.tokens) {
          if (!tokens.includes(curToken)) {
            continue listLoop;
          }
        }

        for (let curToken of list.notTokens) {
          if (tokens.includes(curToken)) {
            continue listLoop;
          }
        }

        // If we reached here, it either means all the checked conditions
        // evaluated to true, or there was just a "Not <DAV:no-lock>" condition.
        return;
      }
    }

    throw new PreconditionFailedError('If header check failed.');
  }

  async checkConditionalHeaders(request: Request, response: AuthResponse) {
    const requestURL = this.getRequestUrl(request);
    let resource: Resource;
    let newResource = false;
    try {
      resource = await response.locals.adapter.getResource(
        requestURL,
        response.locals.baseUrl
      );
    } catch (e: any) {
      if (e instanceof ResourceNotFoundError) {
        resource = await response.locals.adapter.newResource(
          requestURL,
          response.locals.baseUrl
        );
        newResource = true;
      } else {
        throw e;
      }
    }

    const ifMatch = request.get('If-Match')?.trim();
    const ifMatchEtags = (ifMatch || '').split(',').map((value) =>
      value
        .trim()
        .replace(/^(?:W\/)?["']/, '')
        .replace(/["']$/, '')
    );
    const ifNoneMatch = request.get('If-None-Match')?.trim();
    const ifNoneMatchEtags = (ifNoneMatch || '').split(',').map((value) =>
      value
        .trim()
        .replace(/^(?:W\/)?["']/, '')
        .replace(/["']$/, '')
    );
    const ifUnmodifiedSince = request.get('If-Unmodified-Since')?.trim();
    const ifModifiedSince = request.get('If-Modified-Since')?.trim();

    let etag = '';
    let lastModified = new Date(0);

    if (!newResource) {
      const properties = await resource.getProperties();
      etag = await resource.getEtag();
      const lastModifiedString = await properties.get('getlastmodified');
      if (typeof lastModifiedString !== 'string') {
        throw new Error('Last modified date property is not a string.');
      }
      lastModified = new Date(lastModifiedString);
    }

    // Check if header for etag. If it's a new resource, any etag should fail.
    if (
      ifMatch != null &&
      ((ifMatch === '*' && newResource) ||
        (ifMatch !== '*' && (etag === '' || !ifMatchEtags.includes(etag))))
    ) {
      throw new PreconditionFailedError('If-Match header check failed.');
    }

    // Check if header for modified date. If it's a new resource, any unmodified
    // date in the past should fail.
    if (
      ifUnmodifiedSince != null &&
      new Date(ifUnmodifiedSince) < lastModified
    ) {
      throw new PreconditionFailedError(
        'If-Unmodified-Since header check failed.'
      );
    }

    let mustIgnoreIfModifiedSince = false;
    if (ifNoneMatch != null) {
      if (
        (request.method === 'MKCOL' || request.method === 'PUT') &&
        ifNoneMatch !== '*'
      ) {
        throw new BadRequestError(
          `If-None-Match, if provided, must be "*" on a ${request.method} request.`
        );
      }

      // Check the request header for the etag.
      if (
        (ifNoneMatch === '*' && !newResource) ||
        (ifNoneMatch !== '*' && etag !== '' && ifNoneMatchEtags.includes(etag))
      ) {
        if (request.method === 'GET' || request.method === 'HEAD') {
          const cacheControl = this.getCacheControl(request);

          if (!cacheControl['no-cache'] && cacheControl['max-age'] !== 0) {
            throw new ResourceNotModifiedError(
              newResource ? undefined : etag,
              newResource ? undefined : lastModified
            );
          }
        } else {
          throw new PreconditionFailedError(
            'If-None-Match header check failed.'
          );
        }
      } else {
        mustIgnoreIfModifiedSince = true;
      }
    }

    // Check the request header for the modified date.
    // According to the spec, the server must ignore If-Modified-Since if none
    // of the etags in If-None-Match match.
    // According to the spec, If-Modified-Since can only be used with GET and
    // HEAD.
    if (
      !mustIgnoreIfModifiedSince &&
      (request.method === 'GET' || request.method === 'HEAD') &&
      ifModifiedSince != null &&
      new Date(ifModifiedSince) >= lastModified
    ) {
      const cacheControl = this.getCacheControl(request);

      if (!cacheControl['no-cache'] && cacheControl['max-age'] !== 0) {
        throw new ResourceNotModifiedError(
          newResource ? undefined : etag,
          newResource ? undefined : lastModified
        );
      }
    }

    // TODO: This seems to cause issues with existing clients.
    // if (
    //   request.method === 'PUT' &&
    //   ifMatch == null &&
    //   ifUnmodifiedSince == null
    // ) {
    //   // Require that PUT for an existing resource is conditional.
    //   // 428 Precondition Required
    //   throw new PreconditionRequiredError(
    //     'Overwriting existing resource requires the use of a conditional header, If-Match or If-Unmodified-Since.'
    //   );
    // }

    await this.checkIfHeader(request, response);
  }

  getRequestUrl(request: Request) {
    return new URL(
      request.url,
      `${request.protocol}://${request.headers.host}`
    );
  }

  getRequestedEncoding(request: Request, response: AuthResponse) {
    const acceptEncoding =
      request.get('Accept-Encoding') || 'identity, *;q=0.5';
    const supported = ['gzip', 'deflate', 'br', 'identity'];
    const encodings: [string, number][] = acceptEncoding
      .split(',')
      .map((value) => value.trim().split(';'))
      .map((value) => [
        value[0],
        parseFloat(value[1]?.replace(/^q=/, '') || '1.0'),
      ]);
    encodings.sort((a, b) => b[1] - a[1]);
    let encoding = '';
    while (![...supported, 'x-gzip', '*'].includes(encoding)) {
      if (!encodings.length) {
        throw new EncodingNotSupportedError(
          'Requested content encoding is not supported.'
        );
      }
      encoding = encodings.splice(0, 1)[0][0];
    }
    if (encoding === '*') {
      // Pick the first encoding that's not listed in the header.
      encoding =
        supported.find(
          (check) => encodings.find(([check2]) => check === check2) == null
        ) || 'gzip';
    }
    response.locals.debug(`Requested encoding: ${encoding}.`);
    return encoding as 'gzip' | 'x-gzip' | 'deflate' | 'br' | 'identity';
  }

  getCacheControl(request: Request) {
    const cacheControlHeader = request.get('Cache-Control') || '*';
    const cacheControl: { [k: string]: number | true } = {};

    cacheControlHeader.split(',').forEach((directive) => {
      if (
        directive.startsWith('max-age=') ||
        directive.startsWith('s-maxage=') ||
        directive.startsWith('stale-while-revalidate=') ||
        directive.startsWith('stale-if-error=') ||
        directive.startsWith('max-stale=') ||
        directive.startsWith('min-fresh=')
      ) {
        const [name, value] = directive.split('=');
        cacheControl[name] = parseInt(value);
      } else {
        cacheControl[directive] = true;
      }
    });

    return cacheControl;
  }

  getRequestData(request: Request, response: AuthResponse) {
    const url = this.getRequestUrl(request);
    const encoding = this.getRequestedEncoding(request, response);
    const cacheControl = this.getCacheControl(request);
    return { url, encoding, cacheControl };
  }

  getRequestDestination(request: Request) {
    const destinationHeader = request.get('Destination');

    let destination: URL | undefined = undefined;
    if (destinationHeader != null) {
      if (destinationHeader.match(/(?:^\/)\.\.?(?:$|\/)/)) {
        throw new BadRequestError(
          'Destination header must not contain dot segments.'
        );
      }
      try {
        destination = new URL(
          destinationHeader,
          new URL(request.url, `${request.protocol}://${request.headers.host}`)
        );
      } catch (e: any) {
        throw new BadRequestError('Destination header must be a valid URI.');
      }
    }

    return destination;
  }

  async getBodyStream(request: Request, response: AuthResponse) {
    if (request.get('Content-Length') === '0') {
      return Readable.from(Buffer.from([]));
    }

    response.locals.debug('Getting body stream.');

    request.setTimeout(this.opts.timeout);

    request.on('timeout', () => {
      response.locals.debug(
        `Timed out after waiting ${this.opts.timeout / 1000} seconds for data.`
      );

      stream.destroy();
    });

    let stream: Readable = request;
    let encoding = request.get('Content-Encoding');
    switch (encoding) {
      case 'gzip':
      case 'x-gzip':
        stream = pipeline(request, zlib.createGunzip(), (e: any) => {
          if (e) {
            throw new Error('Compression pipeline failed: ' + e);
          }
        });
        break;
      case 'deflate':
        stream = pipeline(request, zlib.createInflate(), (e: any) => {
          if (e) {
            throw new Error('Compression pipeline failed: ' + e);
          }
        });
        break;
      case 'br':
        stream = pipeline(request, zlib.createBrotliDecompress(), (e: any) => {
          if (e) {
            throw new Error('Compression pipeline failed: ' + e);
          }
        });
        break;
      case 'identity':
        break;
      default:
        if (encoding != null) {
          throw new MediaTypeNotSupportedError(
            'Provided content encoding is not supported.'
          );
        }
        break;
    }

    return stream;
  }

  async sendBodyContent(
    response: AuthResponse,
    content: string,
    encoding: 'gzip' | 'x-gzip' | 'deflate' | 'br' | 'identity'
  ) {
    vary(response, 'Accept-Encoding');

    // First, check cache-control.
    const cacheControl = response.getHeader('Cache-Control');
    const noTransform =
      typeof cacheControl === 'string' &&
      cacheControl.match(/(?:^|,)\s*?no-transform\s*?(?:,|$)/);

    if (!this.opts.compression || encoding === 'identity' || noTransform) {
      response.locals.debug(`Response encoding: identity`);
      const unencodedContent = Buffer.from(content, 'utf-8');
      response.set({
        'Content-Length': unencodedContent.byteLength,
      });
      response.send(unencodedContent);
    } else {
      response.locals.debug(`Response encoding: ${encoding}`);
      let transform: (content: Buffer) => Buffer = (content) => content;
      switch (encoding) {
        case 'gzip':
        case 'x-gzip':
          transform = (content) => zlib.gzipSync(content);
          break;
        case 'deflate':
          transform = (content) => zlib.deflateSync(content);
          break;
        case 'br':
          transform = (content) => zlib.brotliCompressSync(content);
          break;
      }
      const unencodedContent = Buffer.from(content, 'utf-8');
      const encodedContent = transform(unencodedContent);
      response.set({
        'Content-Encoding': encoding,
        'Content-Length': encodedContent.byteLength,
      });
      response.send(encodedContent);
    }
  }

  /**
   * Get the body of the request as an XML object from xml2js.
   *
   * If you call this function, it means that anything other than XML in the
   * body is an error.
   *
   * If the body is empty, it will return null.
   */
  async getBodyXML(request: Request, response: AuthResponse) {
    const stream = await this.getBodyStream(request, response);
    const contentTypeHeader = request.get('Content-Type');
    const contentLengthHeader = request.get('Content-Length');
    const transferEncoding = request.get('Transfer-Encoding');

    if (transferEncoding === 'chunked') {
      // TODO: transfer-encoding chunked.
      response.locals.debug('Request transfer encoding is chunked.');
    }

    if (contentTypeHeader == null && contentLengthHeader === '0') {
      return null;
    }

    // Be nice to clients who don't send a Content-Type header.
    const requestType = contentType.parse(
      contentTypeHeader || 'application/xml'
    );

    if (
      requestType.type !== 'text/xml' &&
      requestType.type !== 'application/xml'
    ) {
      throw new MediaTypeNotSupportedError(
        'Provided content type is not supported.'
      );
    }

    if (
      ![
        'ascii',
        'utf8',
        'utf-8',
        'utf16le',
        'ucs2',
        'ucs-2',
        'base64',
        'base64url',
        'latin1',
        'binary',
        'hex',
      ].includes(requestType?.parameters?.charset || 'utf-8')
    ) {
      throw new MediaTypeNotSupportedError(
        'Provided content charset is not supported.'
      );
    }

    const encoding: BufferEncoding = (requestType?.parameters?.charset ||
      'utf-8') as BufferEncoding;

    let xml = await new Promise<string>((resolve, reject) => {
      const buffers: Buffer[] = [];

      stream.on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      });

      stream.on('end', () => {
        resolve(Buffer.concat(buffers).toString(encoding));
      });

      stream.on('error', (e: any) => {
        reject(e);
      });
    });

    if (xml.trim() === '') {
      return null;
    }

    return xml;
  }

  /**
   * Parse XML into a form that uses the DAV: namespace.
   *
   * Tags and attributes from other namespaces will have their namespace and the
   * string '%%' prepended to their name.
   */
  async parseXml(xml: string) {
    let parsed = await this.xmlParser.parseStringPromise(xml);
    let prefixes: { [k: string]: string } = {};

    const rewriteAttributes = (
      input: {
        [k: string]: {
          name: string;
          value: string;
          prefix: string;
          local: string;
          uri: string;
        };
      },
      namespace: string
    ): any => {
      const output: { [k: string]: string } = {};

      for (let name in input) {
        if (
          input[name].uri === 'http://www.w3.org/2000/xmlns/' ||
          input[name].uri === 'http://www.w3.org/XML/1998/namespace'
        ) {
          output[name] = input[name].value;
        } else if (
          input[name].uri === 'DAV:' ||
          (input[name].uri === '' && namespace === 'DAV:')
        ) {
          output[input[name].local] = input[name].value;
        } else {
          output[`${input[name].uri || namespace}%%${input[name].local}`] =
            input[name].value;
        }
      }

      return output;
    };

    const extractNamespaces = (input: {
      [k: string]: {
        name: string;
        value: string;
        prefix: string;
        local: string;
        uri: string;
      };
    }) => {
      const output: { [k: string]: string } = {};

      for (let name in input) {
        if (
          input[name].uri === 'http://www.w3.org/2000/xmlns/' &&
          input[name].local !== '' &&
          input[name].value !== 'DAV:'
        ) {
          output[input[name].local] = input[name].value;
        }
      }

      return output;
    };

    const recursivelyRewrite = (
      input: any,
      lang?: string,
      element = '',
      prefix: string = '',
      namespaces: { [k: string]: string } = {},
      includeLang = false
    ): any => {
      if (Array.isArray(input)) {
        return input.map((value) =>
          recursivelyRewrite(
            value,
            lang,
            element,
            prefix,
            namespaces,
            includeLang
          )
        );
      } else if (typeof input === 'object') {
        const output: { [k: string]: any } = {};
        // Remember the xml:lang attribute, as required by spec.
        let curLang = lang;
        let curNamespaces = { ...namespaces };

        if ('$' in input) {
          if ('xml:lang' in input.$) {
            curLang = input.$['xml:lang'].value as string;
          }

          output.$ = rewriteAttributes(input.$, input.$ns.uri);
          curNamespaces = {
            ...curNamespaces,
            ...extractNamespaces(input.$),
          };
        }

        if (curLang != null && includeLang) {
          output.$ = output.$ || {};
          output.$['xml:lang'] = curLang;
        }

        if (element.includes('%%') && prefix !== '') {
          const uri = element.split('%%', 1)[0];
          if (prefix in curNamespaces && curNamespaces[prefix] === uri) {
            output.$ = output.$ || {};
            output.$[`xmlns:${prefix}`] = curNamespaces[prefix];
          }
        }

        for (let name in input) {
          if (name === '$ns' || name === '$') {
            continue;
          }

          const ns = (Array.isArray(input[name])
            ? input[name][0].$ns
            : input[name].$ns) || { local: name, uri: 'DAV:' };

          let prefix = '';
          if (name.includes(':')) {
            prefix = name.split(':', 1)[0];
            if (!(prefix in prefixes)) {
              prefixes[prefix] = ns.uri;
            }
          }

          const el = ns.uri === 'DAV:' ? ns.local : `${ns.uri}%%${ns.local}`;
          output[el] = recursivelyRewrite(
            input[name],
            curLang,
            el,
            prefix,
            curNamespaces,
            element === 'prop'
          );
        }

        return output;
      } else {
        return input;
      }
    };

    const output = recursivelyRewrite(parsed);
    return { output, prefixes };
  }

  /**
   * Render XML that's in the form returned by `parseXml`.
   */
  async renderXml(xml: any, prefixes: { [k: string]: string } = {}) {
    let topLevelObject: { [k: string]: any } | undefined = undefined;
    const prefixEntries = Object.entries(prefixes);
    const davPrefix = (prefixEntries.find(
      ([_prefix, value]) => value === 'DAV:'
    ) || ['', 'DAV:'])[0];

    const recursivelyRewrite = (
      input: any,
      namespacePrefixes: { [k: string]: string } = {},
      element = '',
      currentUri = 'DAV:',
      addNamespace?: string
    ): any => {
      if (Array.isArray(input)) {
        return input.map((value) =>
          recursivelyRewrite(
            value,
            namespacePrefixes,
            element,
            currentUri,
            addNamespace
          )
        );
      } else if (typeof input === 'object') {
        const output: { [k: string]: any } =
          element === ''
            ? {}
            : {
                $: {
                  ...(addNamespace == null ? {} : { xmlns: addNamespace }),
                },
              };

        const curNamespacePrefixes = { ...namespacePrefixes };

        if ('$' in input) {
          for (let attr in input.$) {
            // Translate uri%%name attributes to prefix:name.
            if (
              attr.includes('%%') ||
              (currentUri !== 'DAV:' && !attr.includes(':') && attr !== 'xmlns')
            ) {
              const [uri, name] = attr.includes('%%')
                ? splitn(attr, '%%', 2)
                : ['DAV:', attr];

              if (currentUri === uri) {
                output.$[name] = input.$[attr];
              } else {
                const xmlns = Object.entries(input.$).find(
                  ([name, value]) => name.startsWith('xmlns:') && value === uri
                );
                if (xmlns) {
                  const [_dec, prefix] = splitn(xmlns[0], ':', 2);
                  output.$[`${prefix}:${name}`] = input.$[attr];
                } else {
                  const prefixEntry = Object.entries(curNamespacePrefixes).find(
                    ([_prefix, value]) => value === uri
                  );

                  output.$[
                    `${prefixEntry ? prefixEntry[0] + ':' : ''}${name}`
                  ] = input.$[attr];
                }
              }
            } else {
              if (attr.startsWith('xmlns:')) {
                // Remove excess namespace declarations.
                if (curNamespacePrefixes[attr.substring(6)] === input.$[attr]) {
                  continue;
                }

                curNamespacePrefixes[attr.substring(6)] = input.$[attr];
              }

              output.$[attr] = input.$[attr];
            }
          }
        }

        const curNamespacePrefixEntries = Object.entries(curNamespacePrefixes);
        for (let name in input) {
          if (name === '$') {
            continue;
          }

          let el = name;
          let prefix = davPrefix;
          let namespaceToAdd: string | undefined = undefined;
          let uri = 'DAV:';
          let local = el;
          if (name.includes('%%')) {
            [uri, local] = splitn(name, '%%', 2);
            // Reset prefix because we're not in the DAV: namespace.
            prefix = '';

            // Look for a prefix in the current prefixes.
            const curPrefixEntry = curNamespacePrefixEntries.find(
              ([_prefix, value]) => value === uri
            );
            if (curPrefixEntry) {
              prefix = curPrefixEntry[0];
            }

            // Look for a prefix in the children. It should override the current
            // prefix.
            const child = Array.isArray(input[name])
              ? input[name][0]
              : input[name];
            if (typeof child === 'object' && '$' in child) {
              let foundPrefix = '';
              for (let attr in child.$) {
                if (attr.startsWith('xmlns:') && child.$[attr] === uri) {
                  foundPrefix = attr.substring(6);
                  break;
                }
              }

              // Make sure every child has the same prefix.
              if (foundPrefix) {
                if (Array.isArray(input[name])) {
                  let prefixIsGood = true;
                  for (let child of input[name]) {
                    if (
                      typeof child !== 'object' ||
                      !('$' in child) ||
                      child.$[`xmlns:${foundPrefix}`] !== uri
                    ) {
                      prefixIsGood = false;
                      break;
                    }
                  }
                  if (prefixIsGood) {
                    prefix = foundPrefix;
                  }
                } else {
                  prefix = foundPrefix;
                }
              }
            }

            if (prefix) {
              el = `${prefix}:${local}`;
            } else {
              // If we haven't found a prefix at all, we need to attach the
              // namespace directly to the element.
              namespaceToAdd = uri;
              el = local;
            }
          }

          let setTopLevel = false;
          if (topLevelObject == null) {
            setTopLevel = true;
          }

          output[el] = recursivelyRewrite(
            input[name],
            curNamespacePrefixes,
            el,
            uri,
            namespaceToAdd
          );

          if (setTopLevel) {
            topLevelObject = output[el];
          }
        }

        return output;
      } else {
        if (addNamespace != null) {
          return {
            $: { xmlns: addNamespace },
            _: input,
          };
        }
        return input;
      }
    };

    const obj = recursivelyRewrite(xml, prefixes);
    if (topLevelObject != null) {
      const obj = topLevelObject as { [k: string]: any };

      // Explicitly set the top level namespace to 'DAV:'.
      obj.$.xmlns = 'DAV:';

      for (let prefix in prefixes) {
        obj.$[`xmlns:${prefix}`] = prefixes[prefix];
      }
    }
    return this.xmlBuilder.buildObject(obj);
  }

  /**
   * Format a list of locks into an object acceptable by xml2js.
   */
  async formatLocks(locks: Lock[]) {
    const xml = { activelock: [] as any[] };

    if (locks != null) {
      for (let lock of locks) {
        const secondsLeft =
          lock.timeout === Infinity
            ? Infinity
            : (lock.date.getTime() + lock.timeout - new Date().getTime()) /
              1000;

        if (secondsLeft <= 0) {
          continue;
        }

        xml.activelock.push({
          locktype: {
            write: {},
          },
          lockscope: {
            [lock.scope]: {},
          },
          depth: {
            _: `${lock.depth}`,
          },
          owner: lock.owner,
          timeout:
            secondsLeft === Infinity
              ? { _: 'Infinite' }
              : { _: `Second-${secondsLeft}` },
          locktoken: { href: { _: lock.token } },
          lockroot: {
            href: {
              _: (await lock.resource.getCanonicalUrl()).pathname,
            },
          },
        });
      }
    }

    if (!xml.activelock.length) {
      return {};
    }

    return xml;
  }
}
