import zlib from 'node:zlib';
import { pipeline, Readable } from 'node:stream';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express, { NextFunction, Request } from 'express';
import cookieParser from 'cookie-parser';

import type { Adapter, AuthResponse } from './Adapter';
import type { Options } from './Options';
import { defaults } from './Options';
import { EncodingNotSupportedError, ResourceNotFoundError } from './Errors';
import { Resource } from './Resource';
import { isMediaTypeCompressed } from './compressedMediaTypes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json')).toString()
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
  options: Partial<Options>
) {
  const opts = Object.assign({}, defaults, options) as Options;

  const app = express();
  app.disable('etag');
  app.use(cookieParser());

  async function authenticate(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    try {
      await adapter.authenticate(request, response);
    } catch (e: any) {
      response.status(500);
      printDevModeError(response, e);
      return;
    }
    next();
  }

  async function unauthenticate(
    request: Request,
    response: AuthResponse,
    next: NextFunction
  ) {
    try {
      await adapter.cleanAuthentication(request, response);
    } catch (e: any) {
      response.status(500);
      printDevModeError(response, e);
      return;
    }
    next();
  }

  // Authenticate before the request.
  app.use(authenticate);

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

  const getRequestedEncoding = (request: Request) => {
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
        throw new EncodingNotSupportedError();
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

  const getRequestData = (request: Request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const encoding = getRequestedEncoding(request);
    const cacheControl = getCacheControl(request);
    return { url, encoding, cacheControl };
  };

  const getOrHead = (method: 'GET' | 'HEAD') => {
    return async (request: Request, response: AuthResponse) => {
      try {
        let { url, encoding, cacheControl } = getRequestData(request);

        if (!(await adapter.isAuthorized(url, method, request, response))) {
          response.status(401); // Unauthorized
          return;
        }

        try {
          const resource = await adapter.getResource(url, request, response);
          const properties = await resource.getProperties();
          const etagPromise = resource.getEtag();
          const lastModifiedPromise = properties.get('Last-Modified');
          const [etag, lastModified] = [
            await etagPromise,
            new Date(await lastModifiedPromise),
          ];

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
              response.status(412); // Precondition Failed
              return;
            }
          }

          // Check if header for modified date.
          const ifUnmodifiedSince = request.get('If-Unmodified-Since');
          if (
            ifUnmodifiedSince != null &&
            new Date(ifUnmodifiedSince) < lastModified
          ) {
            response.status(412); // Precondition Failed
            return;
          }

          const mediaType = await resource.getMediaType();

          if (!opts.compression || isMediaTypeCompressed(mediaType)) {
            encoding = 'identity';
          }
          // TODO: Set encoding to "identity" if the media type is already
          //       compressed, or if compression is disabled in options.

          response.set({
            'Cache-Control': 'private, no-cache',
            Date: new Date().toUTCString(),
            Vary: 'Accept-Encoding',
          });

          if (!cacheControl['no-cache'] && cacheControl['max-age'] !== 0) {
            // Check the request header for the etag.
            const ifNoneMatch = request.get('If-None-Match');
            if (
              ifNoneMatch != null &&
              ifNoneMatch.trim().replace(/^["']/, '').replace(/["']$/, '') ===
                etag
            ) {
              response.status(304); // Not Modified
              return;
            }

            // Check the request header for the modified date.
            const ifModifiedSince = request.get('If-Modified-Since');
            if (
              ifModifiedSince != null &&
              new Date(ifModifiedSince) >= lastModified
            ) {
              response.status(304); // Not Modified
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
                response.write('0\r\n\r\n');
                response.end();
              });
            }
          }
        } catch (e: any) {
          if (e instanceof ResourceNotFoundError) {
            response.status(404); // Not Found
            return;
          }

          throw e;
        }
      } catch (e: any) {
        if (e instanceof EncodingNotSupportedError) {
          response.status(406); // Not Acceptable
          response.send('Requested content encoding is not supported.');
          return;
        }

        response.status(500); // Internal Server Error
        printDevModeError(response, e);
        return;
      }
    };
  };

  app.get('*', getOrHead('GET'));
  app.head('*', getOrHead('HEAD'));

  app.post('*', async (_request, _response: AuthResponse) => {
    // What does a POST do in WebDAV?
  });

  app.put('*', async (request, response: AuthResponse) => {
    try {
      const { url } = getRequestData(request);

      if (!(await adapter.isAuthorized(url, 'PUT', request, response))) {
        response.status(401); // Unauthorized
        return;
      }

      let resource: Resource;
      let newResource = false;
      try {
        resource = await adapter.getResource(url, request, response);
      } catch (e: any) {
        if (e instanceof ResourceNotFoundError) {
          resource = await adapter.newResource(url, request, response);
          newResource = true;
        }
        throw e;
      }

      if (newResource) {
        // Check if header for etag.
        const ifMatch = request.get('If-Match');

        // It's a new resource, so any etag should fail.
        if (ifMatch != null) {
          response.status(412); // Precondition Failed
          return;
        }
      } else {
        const properties = await resource.getProperties();
        const etagPromise = resource.getEtag();
        const lastModifiedPromise = properties.get('Last-Modified');
        const [etag, lastModified] = [
          await etagPromise,
          new Date(await lastModifiedPromise),
        ];

        // Check if header for etag.
        const ifMatch = request.get('If-Match');
        if (ifMatch != null) {
          const ifMatchEtags = ifMatch
            .split(',')
            .map((value) =>
              value.trim().replace(/^["']/, '').replace(/["']$/, '')
            );
          if (ifMatchEtags.indexOf(etag) === -1) {
            response.status(412); // Precondition Failed
            return;
          }
        }

        // Check if header for modified date.
        const ifUnmodifiedSince = request.get('If-Unmodified-Since');
        if (
          ifUnmodifiedSince != null &&
          new Date(ifUnmodifiedSince) < lastModified
        ) {
          response.status(412); // Precondition Failed
          return;
        }

        if (ifMatch == null && ifUnmodifiedSince == null) {
          // Require that PUT for an existing resource is conditional.
          response.status(428); // Precondition Required
          response.send(
            'Overwriting existing resources require the use of a conditional header, If-Match or If-Unmodified-Since.'
          );
          return;
        }
      }

      const ifNoneMatch = request.get('If-None-Match');
      if (ifNoneMatch != null) {
        if (ifNoneMatch.trim() === '*') {
          if (!newResource) {
            response.status(412); // Precondition Failed
            return;
          }
        } else {
          response.status(400); // Bad Request
          response.send(
            'If-None-Match, if provided, must be "*" on a PUT request.'
          );
          return;
        }
      }

      response.set({
        'Cache-Control': 'private, no-cache',
        Date: new Date().toUTCString(),
      });

      let stream: Readable = request;
      let encoding = request.get('Content-Encoding');
      response.set({
        'Content-Encoding': encoding,
      });
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
          stream = pipeline(
            request,
            zlib.createBrotliDecompress(),
            (e: any) => {
              if (e) {
                throw new Error('Compression pipeline failed: ' + e);
              }
            }
          );
          break;
        case 'identity':
          break;
        default:
          if (encoding != null) {
            response.status(415); // Unsupported Media Type
            response.send('Provided content encoding is not supported.');
            return;
          }
          break;
      }

      await resource.setStream(stream);

      response.status(newResource ? 201 : 204); // Created or No Content
      response.set({
        'Content-Location': (await resource.getCanonicalUrl()).pathname,
      });
      response.end();
    } catch (e: any) {
      if (e instanceof EncodingNotSupportedError) {
        response.status(406); // Not Acceptable
        response.send('Requested content encoding is not supported.');
        return;
      }

      response.status(500); // Internal Server Error
      printDevModeError(response, e);
      return;
    }
  });

  app.patch('*', async (request, response: AuthResponse) => {});

  app.delete('*', async (request, response: AuthResponse) => {});

  app.copy('*', async (request, response: AuthResponse) => {});

  app.move('*', async (request, response: AuthResponse) => {});

  app.mkcol('*', async (request, response: AuthResponse) => {});

  app.options('*', async (request, response: AuthResponse) => {});

  app.lock('*', async (request, response: AuthResponse) => {});

  app.unlock('*', async (request, response: AuthResponse) => {});

  app.search('*', async (request, response: AuthResponse) => {});

  app.all('*', async (request, response: AuthResponse) => {
    // propfind
    // proppatch
    // On 405 response:
    // Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, COPY, MOVE, MKCOL, OPTIONS, LOCK, UNLOCK, SEARCH, PROPFIND, PROPPATCH',
  });

  // Unauthenticate after the request.
  app.use(unauthenticate);

  /**
   * Output information about an error in the response body if the server is not
   * in production mode.
   *
   * @param response Response to print the error on.
   * @param error Error object to print.
   */
  function printDevModeError(response: AuthResponse, error: Error) {
    if (!response.headersSent) {
      response.setHeader('Content-Type', 'application/json');
    }
    response.send({
      message: error.message,
      error,
      ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {}),
    });
  }

  return app;
}
