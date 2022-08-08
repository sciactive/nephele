import zlib from 'node:zlib';
import { pipeline, Readable } from 'node:stream';
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

export class GetOrHead extends Method {
  async runGetOrHead(
    method: 'GET' | 'HEAD',
    request: Request,
    response: AuthResponse
  ) {
    let { url, encoding } = this.getRequestData(request, response);

    await this.checkAuthorization(request, response, method);

    const resource = await this.adapter.getResource(url, request.baseUrl);
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

    await this.checkConditionalHeaders(request, response);

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
    if (method === 'GET' && mediaType != null && rangeHeader != null) {
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
            'The specified Range header is not satisfiable.'
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
        'Content-Length': contentLength,
      });

      response.locals.debug('Beginning response stream.');

      if (ranges.length === 1) {
        const range = ranges[0];
        const stream = await resource.getStream(range);

        request.on('close', () => {
          if (!stream.readableEnded) {
            // This happens when the request is aborted.
            stream.destroy();
          }
        });

        response.set({
          'Content-Type': mediaType,
          'Content-Range': `bytes ${range.start}-${range.end}/${contentLength}`,
        });

        stream.pipe(response);
        stream.on('end', () => {
          response.locals.debug('Response stream finished.');
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
            if (!stream.readableEnded) {
              // This happens when the request is aborted.
              stream.destroy();
            }
          });

          await writeText(`\nContent-Type: ${mediaType}`);
          await writeText(
            `\nContent-Range: bytes ${range.start}-${range.end}/${contentLength}`
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

      return;
    }

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
    if (method === 'HEAD') {
      response.end();
    } else {
      let stream: Readable = await resource.getStream();

      request.on('close', () => {
        if (!stream.readableEnded) {
          // This happens when the request is aborted.
          stream.destroy();
        }
      });

      response.locals.debug('Beginning response stream.');
      if (encoding === 'identity') {
        response.set({
          'Content-Length': `${await resource.getLength()}`,
        });

        stream.pipe(response);
        stream.on('end', () => {
          response.locals.debug('Response stream finished.');
        });
      } else {
        response.set({
          'Content-Encoding': encoding,
        });

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
            stream = pipeline(stream, zlib.createBrotliCompress(), (e: any) => {
              if (e) {
                throw new Error('Compression pipeline failed: ' + e);
              }
            });
            break;
        }

        await new Promise<void>((resolve, reject) => {
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

          stream.on('error', reject);

          stream.on('end', () => {
            writeText('0\r\n\r\n');
            response.locals.debug('Response stream finished.');
          });

          stream.on('close', resolve);
        });
      }
    }
  }
}
