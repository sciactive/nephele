import { inspect } from 'node:util';
import zlib from 'node:zlib';
import { pipeline, Readable } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request } from 'express';
import cookieParser from 'cookie-parser';
import createDebug from 'debug';
import { nanoid } from 'nanoid';
import xml2js from 'xml2js';
import contentType from 'content-type';

import type { Adapter, AuthResponse, Resource } from './Interfaces/index.js';
import type { Options } from './Options.js';
import { defaults } from './Options.js';
import {
  BadRequestError,
  EncodingNotSupportedError,
  FailedDependencyError,
  ForbiddenError,
  InsufficientStorageError,
  LockedError,
  MediaTypeNotSupportedError,
  MethodNotSupportedError,
  NotAcceptableError,
  PreconditionFailedError,
  RequestURITooLongError,
  ResourceExistsError,
  ResourceNotFoundError,
  ResourceTreeNotCompleteError,
  UnauthorizedError,
  UnprocessableEntityError,
} from './Errors/index.js';
import { isMediaTypeCompressed } from './compressedMediaTypes.js';
import { MultiStatus, Status, PropStatStatus } from './MultiStatus.js';

const debug = createDebug('nephele:server');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json')).toString()
);

/**
 * A server middleware creator for Nephele, a WebDAV server library.
 *
 * In order to use this server, you must provide it with an adapter. Your
 * Nephele adapter is responsible for actually making changes to the
 * database/filsystem/whatever you use to manage resources.
 *
 * Written by Hunter Perrin for SciActive.
 *
 * @author Hunter Perrin <hperrin@gmail.com>
 * @copyright SciActive Inc
 * @see http://sciactive.com/
 */
export default function createServer(
  adapter: Adapter,
  options: Partial<Options> = {}
) {
  const opts = Object.assign({}, defaults, options) as Options;

  const app = express();
  app.disable('etag');
  app.use(cookieParser());

  const xmlParser = new xml2js.Parser();
  const xmlBuilder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
  });

  async function debugLogger(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.locals.requestId = nanoid(8);
    response.locals.debug = debug.extend(`${response.locals.requestId}`);
    response.locals.debug(
      `IP: ${request.ip}, Method: ${request.method}, URL: ${request.originalUrl}`
    );
    next();
  }

  // Log the details of the request.
  app.use(debugLogger);

  async function debugLoggerEnd(
    _request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.on('close', () => {
      response.locals.debug(
        `Response: ${response.statusCode} ${response.statusMessage || ''}`
      );

      if (response.locals.error) {
        response.locals.debug(
          `Error Message: ${response.locals.error.message}`
        );
      }
    });
    next();
  }

  // Log the details of the response.
  app.use(debugLoggerEnd);

  async function authenticate(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    try {
      response.locals.debug(`Authenticating user.`);
      response.locals.user = await adapter.authenticate(request, response);
    } catch (e: any) {
      response.locals.debug(`Auth failed.`);
      response.locals.error = e;
      if (e instanceof UnauthorizedError) {
        response.status(401);
        response.set(
          'WWW-Authenticate',
          `Basic realm="${opts.realm}", charset="UTF-8"`
        );
        opts.errorHandler(401, 'Unauthorized.', request, response, e);
        return;
      }

      if (e instanceof ForbiddenError) {
        response.status(403);
        opts.errorHandler(403, 'Forbidden.', request, response, e);
        return;
      }

      response.locals.debug('Error: ', e);
      response.status(500);
      opts.errorHandler(500, 'Internal server error.', request, response, e);
      return;
    }
    next();
  }

  // Authenticate before the request.
  app.use(authenticate);

  async function unauthenticate(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.on('close', async () => {
      try {
        await adapter.cleanAuthentication(request, response);
      } catch (e: any) {
        response.locals.debug('Error during authentication cleanup: ', e);
      }
    });
    next();
  }

  // Unauthenticate after the request.
  app.use(unauthenticate);

  async function addServerHeader(
    _request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    response.set({
      Server: `${pkg.name}/${pkg.version}`,
    });
    next();
  }

  // Add the server header to the response.
  app.use(addServerHeader);

  const catchAndReportErrors = (
    fn: (request: Request, response: AuthResponse) => Promise<void>
  ) => {
    return async (request: Request, response: AuthResponse) => {
      try {
        await fn(request, response);
      } catch (e: any) {
        response.locals.error = e;

        if (e instanceof BadRequestError) {
          response.status(400); // Bad Request
          opts.errorHandler(400, e.message, request, response, e);
          return;
        }

        if (e instanceof UnauthorizedError) {
          response.status(401); // Unauthorized
          opts.errorHandler(401, e.message, request, response);
          return;
        }

        if (e instanceof ForbiddenError) {
          response.status(403); // Forbidden
          opts.errorHandler(403, e.message, request, response, e);
          return;
        }

        if (e instanceof ResourceNotFoundError) {
          response.status(404); // Not Found
          opts.errorHandler(404, e.message, request, response, e);
          return;
        }

        if (e instanceof MethodNotSupportedError) {
          response.status(405); // Method Not Allowed
          opts.errorHandler(405, e.message, request, response, e);
          return;
        }

        if (e instanceof EncodingNotSupportedError) {
          response.status(406); // Not Acceptable
          opts.errorHandler(406, e.message, request, response, e);
          return;
        }

        if (e instanceof NotAcceptableError) {
          response.status(406); // Not Acceptable
          opts.errorHandler(406, e.message, request, response, e);
          return;
        }

        if (e instanceof PreconditionFailedError) {
          response.status(412); // Precondition Failed
          opts.errorHandler(412, e.message, request, response, e);
          return;
        }

        if (e instanceof RequestURITooLongError) {
          response.status(414); // Request-URI Too Long
          opts.errorHandler(414, e.message, request, response, e);
          return;
        }

        if (e instanceof MediaTypeNotSupportedError) {
          response.status(415); // Unsupported Media Type
          opts.errorHandler(415, e.message, request, response, e);
          return;
        }

        if (e instanceof ResourceExistsError) {
          response.status(405); // Method Not Allowed
          opts.errorHandler(405, e.message, request, response, e);
          return;
        }

        if (e instanceof ResourceTreeNotCompleteError) {
          response.status(409); // Conflict
          opts.errorHandler(409, e.message, request, response, e);
          return;
        }

        if (e instanceof UnprocessableEntityError) {
          response.status(422); // Unprocessable Entity
          opts.errorHandler(422, e.message, request, response, e);
          return;
        }

        if (e instanceof LockedError) {
          response.status(423); // Locked
          opts.errorHandler(423, e.message, request, response, e);
          return;
        }

        if (e instanceof FailedDependencyError) {
          response.status(424); // Failed Dependency
          opts.errorHandler(424, e.message, request, response, e);
          return;
        }

        if (e instanceof InsufficientStorageError) {
          response.status(507); // Insufficient Storage
          opts.errorHandler(507, e.message, request, response, e);
          return;
        }

        response.locals.debug('Unknown Error: ', e);
        response.status(500); // Internal Server Error
        opts.errorHandler(
          500,
          e.message || 'Internal server error.',
          request,
          response,
          e
        );
        return;
      }
    };
  };

  const getRequestedEncoding = (request: Request, response: AuthResponse) => {
    const acceptEncoding = request.get('Accept-Encoding') || '*';
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
    while ([...supported, 'x-gzip', '*'].indexOf(encoding) === -1) {
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
    response.locals.debug(`Requested encoding is ${encoding}.`);
    return encoding as 'gzip' | 'x-gzip' | 'deflate' | 'br' | 'identity';
  };

  const getCacheControl = (request: Request) => {
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
  };

  const getRequestData = (request: Request, response: AuthResponse) => {
    const url = new URL(
      request.url,
      `${request.protocol}://${request.headers.host}`
    );
    const encoding = getRequestedEncoding(request, response);
    const cacheControl = getCacheControl(request);
    return { url, encoding, cacheControl };
  };

  const getBodyStream = async (request: Request) => {
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
  };

  /**
   * Get the body of the request as an XML object from xml2js.
   *
   * If you call this function, it means that anything other than XML in the
   * body is an error.
   *
   * If the body is empty, it will return null.
   */
  const getBodyXML = async (request: Request) => {
    const stream = await getBodyStream(request);
    const contentTypeHeader = request.get('Content-Type');

    if (contentTypeHeader == null) {
      return null;
    }

    const requestType = contentType.parse(contentTypeHeader);

    if (
      requestType.type != null &&
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

      stream.on('error', (e) => {
        reject(e);
      });
    });

    if (xml.trim() === '') {
      return null;
    }

    return await xmlParser.parseStringPromise(xml);
  };

  app.options(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {
      const { url } = getRequestData(request, response);

      const complianceClasses = [
        '1',
        '3',
        ...(await adapter.getComplianceClasses(url, request, response)),
      ];
      const allowedMethods = [
        'OPTIONS',
        'GET',
        'HEAD',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'COPY',
        'MOVE',
        'MKCOL',
        'SEARCH',
        'PROPFIND',
        'PROPPATCH',
        ...(complianceClasses.includes('2') ? ['LOCK', 'UNLOCK'] : []),
        ...(await adapter.getAllowedMethods(url, request, response)),
      ];
      const cacheControl = await adapter.getOptionsResponseCacheControl(
        url,
        request,
        response
      );

      request.on('data', () => {
        response.locals.debug('Provided body to OPTIONS.');
        throw new MediaTypeNotSupportedError(
          "This server doesn't understand the body sent in the request."
        );
      });

      await new Promise<void>((resolve, _reject) => {
        request.on('end', () => {
          resolve();
        });
      });

      response.status(204); // No Content
      response.set({
        'Cache-Control': cacheControl,
        Date: new Date().toUTCString(),
        Allow: allowedMethods.join(', '),
        DAV: complianceClasses.join(', '),
      });
      response.end();
    })
  );

  const getOrHead = (method: 'GET' | 'HEAD') => {
    return async (request: Request, response: AuthResponse) => {
      let { url, encoding, cacheControl } = getRequestData(request, response);

      if (!(await adapter.isAuthorized(url, method, request, response))) {
        throw new UnauthorizedError('Unauthorized.');
      }

      const resource = await adapter.getResource(url, request, response);
      const properties = await resource.getProperties();
      const etagPromise = resource.getEtag();
      const lastModifiedPromise = properties.get('getlastmodified');
      const contentLanguagePromise = properties.get('getcontentlanguage');
      const [etag, lastModifiedString, contentLanguage] = [
        await etagPromise,
        await lastModifiedPromise,
        await contentLanguagePromise,
      ];
      if (typeof lastModifiedString !== 'string') {
        throw new Error('Last modified date property is not a string.');
      }
      const lastModified = new Date(lastModifiedString);
      if (contentLanguage != null && typeof contentLanguage !== 'string') {
        throw new Error('Content language property is not a string.');
      }

      // TODO: use If-Range here. If-Match and If-Unmodified-Since are for PUT.
      // Check if header for etag.
      const ifMatch = request.get('If-Match');
      if (ifMatch != null) {
        const ifMatchEtags = ifMatch
          .split(',')
          .map((value) =>
            value.trim().replace(/^["']/, '').replace(/["']$/, '')
          );
        if (ifMatchEtags.indexOf(etag) === -1) {
          throw new PreconditionFailedError('If-Match header check failed.');
        }
      }

      // Check if header for modified date.
      const ifUnmodifiedSince = request.get('If-Unmodified-Since');
      if (
        ifUnmodifiedSince != null &&
        new Date(ifUnmodifiedSince) < lastModified
      ) {
        throw new PreconditionFailedError(
          'If-Unmodified-Since header check failed.'
        );
      }

      const mediaType = await resource.getMediaType();

      if (!opts.compression || isMediaTypeCompressed(mediaType)) {
        encoding = 'identity';
      }

      response.set({
        'Cache-Control': 'private, no-cache',
        Date: new Date().toUTCString(),
        Vary: 'Accept-Encoding',
      });
      if (contentLanguage != null && contentLanguage !== '') {
        response.set({
          'Content-Language': contentLanguage,
        });
      }

      if (!cacheControl['no-cache'] && cacheControl['max-age'] !== 0) {
        // Check the request header for the etag.
        const ifNoneMatch = request.get('If-None-Match');
        if (
          ifNoneMatch != null &&
          ifNoneMatch.trim().replace(/^["']/, '').replace(/["']$/, '') === etag
        ) {
          response.status(304); // Not Modified
          response.end();
          return;
        }

        // Check the request header for the modified date.
        const ifModifiedSince = request.get('If-Modified-Since');
        if (
          ifModifiedSince != null &&
          new Date(ifModifiedSince) >= lastModified
        ) {
          response.status(304); // Not Modified
          response.end();
          return;
        }
      }

      // TODO: put If-Range check here for partial content responses.

      response.status(200); // Ok
      response.set({
        'Content-Type': mediaType,
        'Content-Encoding': encoding,
        Etag: JSON.stringify(etag),
        'Last-Modified': lastModified.toUTCString(),
      });
      if (encoding !== 'identity') {
        // Inform the client, even on a HEAD request, that this entity will be transmitted in
        // chunks.
        response.locals.debug('Set to chunked encoding.');
        response.set({
          'Transfer-Encoding': 'chunked',
        });
      }
      if (method === 'GET') {
        let stream: Readable = await resource.getStream();
        if (encoding === 'identity') {
          response.set({
            'Content-Length': `${await resource.getLength()}`, // how to do this with compressed encoding
          });

          stream.pipe(response);
        } else {
          switch (encoding) {
            case 'gzip':
            case 'x-gzip':
              stream = pipeline(stream, zlib.createGzip(), (e: any) => {
                if (e) {
                  throw new Error('Compression pipeline failed: ' + e);
                }
              });
              break;
            case 'deflate':
              stream = pipeline(stream, zlib.createDeflate(), (e: any) => {
                if (e) {
                  throw new Error('Compression pipeline failed: ' + e);
                }
              });
              break;
            case 'br':
              stream = pipeline(
                stream,
                zlib.createBrotliCompress(),
                (e: any) => {
                  if (e) {
                    throw new Error('Compression pipeline failed: ' + e);
                  }
                }
              );
              break;
          }

          response.locals.debug('Beginning response stream.');
          stream.on('data', (chunk) => {
            response.write(
              ('length' in chunk ? chunk.length : chunk.size).toString(16) +
                '\r\n'
            );
            response.write(chunk);
            if (!response.write('\r\n')) {
              stream.pause();

              response.once('drain', () => stream.resume());
            }
          });

          stream.on('end', () => {
            response.locals.debug('Response stream finished.');
            response.write('0\r\n\r\n');
            response.end();
          });
        }
      }
    };
  };

  app.get('*', catchAndReportErrors(getOrHead('GET')));
  app.head('*', catchAndReportErrors(getOrHead('HEAD')));

  app.post(
    '*',
    catchAndReportErrors(async (_request, _response: AuthResponse) => {
      // What does a POST do in WebDAV?
      throw new MethodNotSupportedError(
        'POST is not implemented on this server.'
      );
    })
  );

  app.put(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {
      const { url } = getRequestData(request, response);

      if (!(await adapter.isAuthorized(url, 'PUT', request, response))) {
        throw new UnauthorizedError('Unauthorized.');
      }

      let resource: Resource;
      let newResource = false;
      try {
        resource = await adapter.getResource(url, request, response);

        if (await resource.isCollection()) {
          throw new MethodNotSupportedError(
            'This resource is an existing collection.'
          );
        }
      } catch (e: any) {
        if (e instanceof ResourceNotFoundError) {
          resource = await adapter.newResource(url, request, response);
          newResource = true;
        } else {
          throw e;
        }
      }

      if (newResource) {
        // Check if header for etag.
        const ifMatch = request.get('If-Match');

        // It's a new resource, so any etag should fail.
        if (ifMatch != null) {
          throw new PreconditionFailedError('If-Match header check failed.');
        }
      } else {
        const properties = await resource.getProperties();
        const etagPromise = resource.getEtag();
        const lastModifiedPromise = properties.get('getlastmodified');
        const [etag, lastModifiedString] = [
          await etagPromise,
          await lastModifiedPromise,
        ];
        if (typeof lastModifiedString !== 'string') {
          throw new Error('Last modified date property is not a string.');
        }
        const lastModified = new Date(lastModifiedString);

        // Check if header for etag.
        const ifMatch = request.get('If-Match');
        if (ifMatch != null) {
          const ifMatchEtags = ifMatch
            .split(',')
            .map((value) =>
              value.trim().replace(/^["']/, '').replace(/["']$/, '')
            );
          if (ifMatchEtags.indexOf(etag) === -1) {
            throw new PreconditionFailedError('If-Match header check failed.');
          }
        }

        // Check if header for modified date.
        const ifUnmodifiedSince = request.get('If-Unmodified-Since');
        if (
          ifUnmodifiedSince != null &&
          new Date(ifUnmodifiedSince) < lastModified
        ) {
          throw new PreconditionFailedError(
            'If-Unmodified-Since header check failed.'
          );
        }

        // TODO: This seems to cause issues with existing clients.
        // if (ifMatch == null && ifUnmodifiedSince == null) {
        //   // Require that PUT for an existing resource is conditional.
        //   // 428 Precondition Required
        //   throw new PreconditionRequiredError(
        //     'Overwriting existing resource requires the use of a conditional header, If-Match or If-Unmodified-Since.'
        //   );
        // }
      }

      const ifNoneMatch = request.get('If-None-Match');
      if (ifNoneMatch != null) {
        if (ifNoneMatch.trim() === '*') {
          if (!newResource) {
            throw new PreconditionFailedError(
              'If-None-Match header check failed.'
            );
          }
        } else {
          throw new BadRequestError(
            'If-None-Match, if provided, must be "*" on a PUT request.'
          );
        }
      }

      response.set({
        'Cache-Control': 'private, no-cache',
        Date: new Date().toUTCString(),
      });

      const contentLanguage = request.get('Content-Language');
      let stream = await getBodyStream(request);
      await resource.setStream(stream, response.locals.user);

      response.status(newResource ? 201 : 204); // Created or No Content
      response.set({
        'Content-Location': (await resource.getCanonicalUrl()).pathname,
      });
      response.end();

      if (contentLanguage && contentLanguage !== '') {
        try {
          const properties = await resource.getProperties();
          await properties.set('getcontentlanguage', contentLanguage);
        } catch (e: any) {
          // Ignore errors here.
        }
      }
    })
  );

  app.patch(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {})
  );

  app.delete(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {})
  );

  app.copy(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {})
  );

  app.move(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {})
  );

  app.mkcol(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {
      const { url } = getRequestData(request, response);

      if (!(await adapter.isAuthorized(url, 'MKCOL', request, response))) {
        throw new UnauthorizedError('Unauthorized.');
      }

      let resource = await adapter.newCollection(url, request, response);

      // Check if header for etag.
      const ifMatch = request.get('If-Match');

      // It's a new resource, so any etag should fail.
      if (ifMatch != null) {
        throw new PreconditionFailedError('If-Match header check failed.');
      }

      const ifNoneMatch = request.get('If-None-Match');
      if (ifNoneMatch != null) {
        if (ifNoneMatch.trim() !== '*') {
          throw new BadRequestError(
            'If-None-Match, if provided, must be "*" on a MKCOL request.'
          );
        }
      }

      response.set({
        'Cache-Control': 'private, no-cache',
        Date: new Date().toUTCString(),
      });

      let stream = await getBodyStream(request);

      stream.on('data', () => {
        response.locals.debug('Provided body to MKCOL.');
        throw new MediaTypeNotSupportedError(
          "This server doesn't understand the body sent in the request."
        );
      });

      await new Promise<void>((resolve, _reject) => {
        stream.on('end', () => {
          resolve();
        });
      });

      await resource.create(response.locals.user);

      response.status(201); // Created
      response.set({
        'Content-Location': (await resource.getCanonicalUrl()).pathname,
      });
      response.end();
    })
  );

  app.lock(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {})
  );

  app.unlock(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {})
  );

  app.search(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {})
  );

  const propfind = async (request: Request, response: AuthResponse) => {
    const { url } = getRequestData(request, response);

    if (!(await adapter.isAuthorized(url, 'PROPFIND', request, response))) {
      throw new UnauthorizedError('Unauthorized.');
    }

    const contentType = request.accepts('application/xml', 'text/xml');
    if (!contentType) {
      throw new NotAcceptableError('Requested content type is not supported.');
    }

    let depth = request.get('Depth') || 'infinity';
    const resource = await adapter.getResource(url, request, response);

    if (!['0', '1', 'infinity'].includes(depth)) {
      throw new BadRequestError(
        'Depth header must be one of "0", "1", or "infinity".'
      );
    }

    const xml = await getBodyXML(request);

    response.locals.debug('XML Body', inspect(xml, false, null));

    let requestedProps: string[] = [];
    let allprop = true;
    let propname = false;
    const multiStatus = new MultiStatus();

    // TODO: parse incoming XML

    let level = 0;
    const addResourceProps = async (resource: Resource) => {
      const url = await resource.getCanonicalUrl();
      response.locals.debug(`Retrieving props for ${url}.`);

      if (!(await adapter.isAuthorized(url, 'PROPFIND', request, response))) {
        const error = new Status(url.toString(), 401);
        error.description =
          'The user is not authorized to get properties for this resource.';
        multiStatus.addStatus(error);
        return;
      }

      const status = new Status(url.toString(), 207);
      const props = await resource.getProperties();

      try {
        if (propname) {
          const propnames = await props.listByUser(response.locals.user);
          const propStatStatus = new PropStatStatus(200);
          const propObj: { [k: string]: {} } = {};
          for (let name of propnames) {
            propObj[name] = {};
          }
          propStatStatus.setProps(propObj);
          status.addPropStatStatus(propStatStatus);
        } else {
          let propObj: { [k: string]: any } = {};
          const forbiddenProps: string[] = [];
          const unauthorizedProps: string[] = [];
          const errorProps: string[] = [];
          if (allprop) {
            propObj = await props.getAllByUser(response.locals.user);
          }

          for (let name of requestedProps) {
            if (name in propObj) {
              continue;
            }

            try {
              const value = await props.getByUser(name, response.locals.user);
              propObj[name] = value;
            } catch (e: any) {
              if (e instanceof ForbiddenError) {
                forbiddenProps.push(name);
              } else if (e instanceof UnauthorizedError) {
                unauthorizedProps.push(name);
              } else {
                errorProps.push(name);
              }
            }
          }

          if (Object.keys(propObj).length) {
            const propStatStatus = new PropStatStatus(200);
            propStatStatus.setProps(propObj);
            status.addPropStatStatus(propStatStatus);
          }

          if (forbiddenProps.length) {
            const propStatStatus = new PropStatStatus(403);
            propStatStatus.description = `The user does not have access to the ${forbiddenProps.join(
              ', '
            )} propert${forbiddenProps.length === 1 ? 'y' : 'ies'}.`;
            propStatStatus.setProps(
              Object.fromEntries(forbiddenProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }

          if (unauthorizedProps.length) {
            const propStatStatus = new PropStatStatus(401);
            propStatStatus.description = `The user is not authorized to retrieve the ${unauthorizedProps.join(
              ', '
            )} propert${unauthorizedProps.length === 1 ? 'y' : 'ies'}.`;
            propStatStatus.setProps(
              Object.fromEntries(unauthorizedProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }

          if (errorProps.length) {
            const propStatStatus = new PropStatStatus(401);
            propStatStatus.description = `An error occurred while trying to retrieve the ${errorProps.join(
              ', '
            )} propert${errorProps.length === 1 ? 'y' : 'ies'}.`;
            propStatStatus.setProps(
              Object.fromEntries(errorProps.map((name) => [name, {}]))
            );
            status.addPropStatStatus(propStatStatus);
          }
        }
      } catch (e: any) {
        const propStatStatus = new PropStatStatus(500);
        propStatStatus.description = 'An internal server error occurred.';
        status.addPropStatStatus(propStatStatus);
      }

      multiStatus.addStatus(status);

      if (depth === '0' || (level === 1 && depth === '1')) {
        return;
      }

      level++;
      const children = await resource.getInternalMembers();
      for (let child of children) {
        await addResourceProps(child);
      }
    };
    await addResourceProps(resource);

    const responseXml = multiStatus.render();
    response.status(207); // Multi-Status
    response.set({
      'Content-Type': contentType,
      'Content-Length': responseXml.length,
    });
    response.send(responseXml);
  };

  const proppatch = async (request: Request, response: AuthResponse) => {};

  app.all(
    '*',
    catchAndReportErrors(async (request, response: AuthResponse) => {
      switch (request.method) {
        case 'PROPFIND':
          await propfind(request, response);
          break;
        case 'PROPPATCH':
          await proppatch(request, response);
          break;
        default:
          const { url } = getRequestData(request, response);
          const adapterMethods = await adapter.getAllowedMethods(
            url,
            request,
            response
          );

          if (!adapterMethods.includes(request.method)) {
            throw new MethodNotSupportedError('Method not allowed.');
          }

          // If the adapter says it can handle the method, just handle the
          // authorization and error handling for it.
          if (
            !(await adapter.isAuthorized(
              url,
              request.method,
              request,
              response
            ))
          ) {
            throw new UnauthorizedError('Unauthorized.');
          }

          await adapter.handleMethod(url, request.method, request, response);
          break;
      }
    })
  );

  debug('Nephele server set up. Ready to start listening.');

  return app;
}
