import zlib from 'node:zlib';
import { pipeline, Readable } from 'node:stream';
import type { Request } from 'express';
import vary from 'vary';

import type { AuthResponse } from '../Interfaces/index.js';
import { PropertyNotFoundError } from '../Errors/index.js';
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
    const contentLanguagePromise = properties.get('getcontentlanguage');
    const etag = await etagPromise;
    const lastModifiedString = await lastModifiedPromise;
    const contentLanguage = await contentLanguagePromise.catch((e) => {
      if (e instanceof PropertyNotFoundError) {
        return undefined;
      }
      return Promise.reject(e);
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

    vary(response, 'Accept-Encoding');
    response.set({
      'Cache-Control': 'private, no-cache',
      Date: new Date().toUTCString(),
    });
    if (contentLanguage != null && contentLanguage !== '') {
      response.set({
        'Content-Language': contentLanguage,
      });
    }

    // TODO: Put If-Range check here for partial content responses.

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
      if (encoding === 'identity') {
        response.set({
          'Content-Length': `${await resource.getLength()}`, // how to do this with compressed encoding
        });

        stream.pipe(response);
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
  }
}
