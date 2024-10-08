import zlib from 'node:zlib';
import { Transform } from 'node:stream';
import type { Request } from 'express';
import vary from 'vary';
import parseRange from 'range-parser';
import { v4 as uuid } from 'uuid';

import type { AuthResponse } from '../Interfaces/index.js';
import {
  BadRequestError,
  PropertyNotFoundError,
  RangeNotSatisfiableError,
} from '../Errors/index.js';
import { isMediaTypeCompressed } from '../compressedMediaTypes.js';

import { Method } from './Method.js';

export class GET_HEAD extends Method {
  async run(request: Request, response: AuthResponse) {
    let { url, encoding } = this.getRequestData(request, response);

    if (
      await this.runPlugins(
        request,
        response,
        request.method === 'GET' ? 'beginGet' : 'beginHead',
        { method: this, url },
      )
    ) {
      return;
    }

    await this.checkAuthorization(request, response, request.method);

    const resource = await response.locals.adapter.getResource(
      url,
      response.locals.baseUrl,
    );

    if ((await resource.isCollection()) && !url.toString().endsWith('/')) {
      response.set({
        'Content-Location': `${url}/`,
      });
    }

    const properties = await resource.getProperties();
    const etagPromise = resource.getEtag();
    const lastModifiedPromise = properties.get('getlastmodified');
    const etag = await etagPromise;
    const lastModifiedString = await lastModifiedPromise;
    const contentLength = await resource.getLength();
    const contentLanguage = await new Promise(async (resolve, reject) => {
      try {
        resolve(await properties.get('getcontentlanguage'));
      } catch (e: any) {
        if (e instanceof PropertyNotFoundError) {
          resolve(undefined);
        } else {
          reject(e);
        }
      }
    });
    if (typeof lastModifiedString !== 'string') {
      throw new Error('Last modified date property is not a string.');
    }
    const lastModified = new Date(lastModifiedString);
    if (contentLanguage != null && typeof contentLanguage !== 'string') {
      throw new Error('Content language property is not a string.');
    }

    if (
      await this.runPlugins(
        request,
        response,
        request.method === 'GET' ? 'preGet' : 'preHead',
        { method: this, resource, properties },
      )
    ) {
      return;
    }

    await this.checkConditionalHeaders(request, response);

    if (
      await this.runPlugins(
        request,
        response,
        request.method === 'GET' ? 'beforeGet' : 'beforeHead',
        { method: this, resource, properties },
      )
    ) {
      return;
    }

    const mediaType = await resource.getMediaType();

    if (
      !this.opts.compression ||
      mediaType == null ||
      isMediaTypeCompressed(mediaType)
    ) {
      encoding = 'identity';
    }

    const rangeHeader = request.get('Range');
    let sendPartialContent = false;
    let ranges: { start: number; end: number }[] = [];
    if (request.method === 'GET' && mediaType != null && rangeHeader != null) {
      sendPartialContent = true;

      // Check the If-Range header for Etags or Modified Date.
      // According to the spec, If-Range can only be used with GET.
      const ifRange = request.get('If-Range')?.trim();
      if (ifRange != null) {
        if (ifRange.startsWith('W/')) {
          throw new BadRequestError('If-Range must not contain a weak etag.');
        } else if (ifRange.startsWith('"') || ifRange.startsWith("'")) {
          if (ifRange.replace(/^["']/, '').replace(/["']$/, '') !== etag) {
            sendPartialContent = false;
          }
        } else {
          if (new Date(ifRange) < lastModified) {
            sendPartialContent = false;
          }
        }
      }

      if (sendPartialContent) {
        // Parse Range header.
        const requestedRanges = parseRange(contentLength, rangeHeader, {
          combine: true,
        });

        if (requestedRanges === -1) {
          throw new RangeNotSatisfiableError(
            'The specified Range header is not satisfiable.',
          );
        }

        if (requestedRanges === -2) {
          throw new BadRequestError('The given Range header is not valid.');
        }

        if (requestedRanges.length === 0) {
          sendPartialContent = false;
        }

        ranges = requestedRanges;
      }
    }

    vary(response, 'Accept-Encoding');
    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
      'Accept-Ranges': 'bytes',
    });
    if (contentLanguage != null && contentLanguage !== '') {
      response.set({
        'Content-Language': contentLanguage,
      });
    }

    /**
     * Write text to the response stream and resolve when complete.
     */
    const writeText = async (text: string) => {
      await new Promise<void>((resolve) => {
        if (!response.write(text)) {
          response.once('drain', resolve);
        } else {
          resolve();
        }
      });
    };

    if (sendPartialContent) {
      response.status(206); // Partial Content
      response.set({
        ETag: JSON.stringify(etag),
        'Last-Modified': lastModified.toUTCString(),
      });

      response.locals.debug('Beginning response stream.');

      if (ranges.length === 1) {
        const range = ranges[0];
        const stream = await resource.getStream(range);

        request.on('close', () => {
          if (!stream.readableEnded || !stream.destroyed) {
            // This happens when the request is aborted.
            stream.destroy(new Error('Request aborted.'));
          }
        });

        response.set({
          'Content-Type': mediaType,
          'Content-Range': `bytes ${range.start}-${range.end}/${contentLength}`,
        });

        await new Promise<void>((resolve, reject) => {
          stream.on('error', reject);

          stream.on('end', () => {
            response.locals.debug('Response stream finished.');
          });

          stream.on('close', resolve);

          if (stream.errored) {
            reject(stream.errored);
          } else {
            stream.pipe(response);
          }
        });
      } else {
        const boundary = uuid();

        response.set({
          'Content-Type': `multipart/byteranges; boundary=${boundary}`,
        });

        await writeText(`--${boundary}`);

        for (let range of ranges) {
          const stream = await resource.getStream(range);

          request.on('close', () => {
            if (!stream.readableEnded || !stream.destroyed) {
              // This happens when the request is aborted.
              stream.destroy(new Error('Request aborted.'));
            }
          });

          await writeText(`\nContent-Type: ${mediaType}`);
          await writeText(
            `\nContent-Range: bytes ${range.start}-${range.end}/${contentLength}`,
          );
          await writeText(`\n\n`);

          await new Promise<void>((resolve, reject) => {
            stream.on('data', (chunk) => {
              if (!response.write(chunk)) {
                stream.pause();

                response.once('drain', () => stream.resume());
              }
            });

            stream.on('error', reject);

            stream.on('end', () => {
              writeText(`\n--${boundary}`);
              response.locals.debug('Response stream finished.');
            });

            stream.on('close', resolve);
          });
        }
      }
    } else {
      response.status(mediaType == null ? 204 : 200); // No Content or Ok

      response.set({
        ETag: JSON.stringify(etag),
        'Last-Modified': lastModified.toUTCString(),
      });

      if (mediaType == null) {
        response.end();
        return;
      }

      response.set({
        'Content-Type': mediaType,
      });
      if (encoding !== 'identity') {
        // Inform the client, even on a HEAD request, that this entity will be transmitted in
        // chunks.
        response.locals.debug('Set to chunked encoding.');
        response.set({
          'Transfer-Encoding': 'chunked',
        });
      }
      response.locals.debug(`Response encoding: ${encoding}`);

      if (request.method !== 'HEAD') {
        let stream = await resource.getStream();

        request.on('close', () => {
          if (!stream.readableEnded || !stream.destroyed) {
            // This happens when the request is aborted.
            stream.destroy(new Error('Request aborted.'));
          }
        });

        response.locals.debug('Beginning response stream.');
        if (encoding === 'identity') {
          response.set({
            'Content-Length': `${await resource.getLength()}`,
          });

          await new Promise<void>((resolve, reject) => {
            stream.on('error', reject);

            stream.on('end', () => {
              response.locals.debug('Response stream finished.');
            });

            stream.on('close', resolve);

            if (stream.errored) {
              reject(stream.errored);
            } else {
              stream.pipe(response);
            }
          });
        } else {
          response.set({
            'Content-Encoding': encoding,
          });

          let encodingStream: Transform;

          switch (encoding) {
            case 'gzip':
            case 'x-gzip':
              encodingStream = zlib.createGzip();
              break;
            case 'deflate':
              encodingStream = zlib.createDeflate();
              break;
            case 'br':
              encodingStream = zlib.createBrotliCompress();
              break;
          }

          await new Promise<void>((resolve, reject) => {
            encodingStream.on('data', (chunk) => {
              response.write(
                ('length' in chunk ? chunk.length : chunk.size).toString(16) +
                  '\r\n',
              );
              response.write(chunk);
              if (!response.write('\r\n')) {
                encodingStream.pause();

                response.once('drain', () => encodingStream.resume());
              }
            });

            encodingStream.on('error', reject);

            encodingStream.on('end', () => {
              writeText('0\r\n\r\n');
              response.locals.debug('Response stream finished.');
            });

            encodingStream.on('close', resolve);

            if (stream.errored) {
              reject(stream.errored);
            } else {
              stream.pipe(encodingStream);
              stream.on('error', (err) => {
                if (!encodingStream.destroyed) {
                  encodingStream.destroy(err);
                }
              });
              encodingStream.on('error', (err) => {
                if (!stream.destroyed) {
                  stream.destroy(err);
                }
              });
            }
          });
        }
      }
    }

    response.end();

    await this.runPlugins(
      request,
      response,
      request.method === 'GET' ? 'afterGet' : 'afterHead',
      { method: this, resource, properties },
    );
  }
}
