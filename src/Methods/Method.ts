import zlib from 'node:zlib';
import { pipeline, Readable } from 'node:stream';
import type { Request } from 'express';
import xml2js from 'xml2js';
import contentType from 'content-type';

import type { Adapter, AuthResponse, Options } from '../index.js';
import {
  EncodingNotSupportedError,
  MediaTypeNotSupportedError,
  MethodNotSupportedError,
  UnauthorizedError,
} from '../index.js';

export class Method {
  adapter: Adapter;
  opts: Options;

  DEV = process.env.NODE_ENV !== 'production';

  xmlParser = new xml2js.Parser();
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

  constructor(adapter: Adapter, opts: Options) {
    this.adapter = adapter;
    this.opts = opts;
  }

  /**
   * You should reimplement this function in your class to handle the method.
   */
  async run(request: Request, _response: AuthResponse) {
    throw new MethodNotSupportedError(
      `${request.method} is not implemented on this server.`
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
      !(await this.adapter.isAuthorized(
        url ||
          new URL(request.url, `${request.protocol}://${request.headers.host}`),
        method || request.method,
        request,
        response
      ))
    ) {
      throw new UnauthorizedError('Unauthorized.');
    }
  }

  getRequestedEncoding(request: Request, response: AuthResponse) {
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
    const url = new URL(
      request.url,
      `${request.protocol}://${request.headers.host}`
    );
    const encoding = this.getRequestedEncoding(request, response);
    const cacheControl = this.getCacheControl(request);
    return { url, encoding, cacheControl };
  }

  async getBodyStream(request: Request) {
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

  /**
   * Get the body of the request as an XML object from xml2js.
   *
   * If you call this function, it means that anything other than XML in the
   * body is an error.
   *
   * If the body is empty, it will return null.
   */
  async getBodyXML(request: Request) {
    const stream = await this.getBodyStream(request);
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

      stream.on('error', (e: any) => {
        reject(e);
      });
    });

    if (xml.trim() === '') {
      return null;
    }

    return await this.xmlParser.parseStringPromise(xml);
  }
}
