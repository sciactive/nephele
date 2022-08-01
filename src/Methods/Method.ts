import zlib from 'node:zlib';
import { pipeline, Readable } from 'node:stream';
import type { Request } from 'express';
import xml2js from 'xml2js';
import contentType from 'content-type';
import splitn from '@sciactive/splitn';

import type {
  Adapter,
  AuthResponse,
  Lock,
  Options,
  Resource,
  User,
} from '../index.js';
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
        request.baseUrl,
        response.locals.user
      ))
    ) {
      throw new UnauthorizedError('Unauthorized.');
    }
  }

  /**
   * Check if the user has permission to modify the resource, given a set of
   * locks they have submitted.
   *
   * Returns 0 if the user has no permissions to modify this resource or any
   * resource this one may contain. (Depth infinity locked.)
   *
   * Returns 1 if this resource is a collection and the user has no permission
   * to modify the resource, but it can modify the members of this resource.
   * (Depth 0 locked.)
   *
   * Returns 2 if the user has full permissions to modify this resource (either
   * it is not locked or the user owns the lock and has provided it).
   *
   * @param resource The resource to check.
   * @param user The user to check.
   * @param lockGuids The lock guids provided by the user.
   */
  async getLockPermission(
    resource: Resource,
    user: User,
    lockGuids: string[]
  ): Promise<0 | 1 | 2> {
    const resourceLocks = await resource.getLocks();

    if (!resourceLocks.length) {
      return 2;
    }

    const userLocks = await resource.getLocksByUser(user);
    const lockGuidsSet = new Set(lockGuids);

    if (userLocks.find((userLock) => lockGuidsSet.has(userLock.guid))) {
      // The user owns the lock and has provided it.
      return 2;
    }

    if (!(await resource.isCollection())) {
      return 0;
    }

    // Find the most restrictive lock.
    let restrictiveLock: Lock = resourceLocks[0];
    for (let lock of resourceLocks) {
      if (restrictiveLock.depth === '0') {
        restrictiveLock = lock;
      }
      if (restrictiveLock.depth === 'infinity') {
        break;
      }
    }

    return restrictiveLock.depth === 'infinity' ? 0 : 1;
  }

  getRequestBaseUrl(request: Request) {
    return new URL(
      request.baseUrl,
      `${request.protocol}://${request.headers.host}`
    );
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
    const contentLengthHeader = request.get('Content-Length');
    // TODO: transfer-encoding chunked.

    if (contentTypeHeader == null && contentLengthHeader === '0') {
      return { output: null, prefixes: {} };
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
      return { output: null, prefixes: {} };
    }

    return await this.parseXml(xml);
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

          output.$ = rewriteAttributes(input.$, input['$ns'].uri);
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
            ? input[name][0]['$ns']
            : input[name]['$ns']) || { local: name, uri: 'DAV:' };

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

            // Look for a prefix in the first child. It should override the
            // current prefix.
            const child = Array.isArray(input[name])
              ? input[name][0]
              : input[name];
            if (
              '$' in child &&
              !('xmlns' in child.$ && child.$.xmlns === uri)
            ) {
              for (let attr in child.$) {
                if (attr.startsWith('xmlns:') && child.$[attr] === uri) {
                  prefix = attr.substring(6);
                  break;
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
}
