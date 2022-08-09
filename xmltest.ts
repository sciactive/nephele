/**
 * Run this file with `npx ts-node --esm xmltest.ts`
 */
import { inspect } from 'node:util';
import xml2js from 'xml2js';

import {
  Method,
  MultiStatus,
  PropStatStatus,
  Status,
  defaults,
  Adapter,
} from './packages/nephele/dist/index.js';

const builder = new xml2js.Builder({
  xmldec: { version: '1.0', encoding: 'UTF-8' },
});
const parser = new xml2js.Parser({
  xmlns: true,
});

const parseIfHeader = async () => {
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

  type List = {
    tokens: string[];
    etags: string[];
    nolock: boolean;
    notTokens: string[];
    notEtags: string[];
    notNolock: boolean;
  };

  const parse = async (
    requestURL: URL,
    ifHeader: string,
    resources: {
      url: URL;
      etag: string;
      tokens: string[];
    }[]
  ) => {
    ifHeader = ifHeader.trim().replace(/\n/g, ' ');

    if (ifHeader.trim() === '') {
      throw new Error('The If header, if provided, must not be empty.');
    }

    // Parse the If header into a usable object.

    const parsedHeader: {
      [resourceUri: string]: List[];
    } = {};

    let currentResource = requestURL.toString();
    const startedWithResource = ifHeader.startsWith('<');
    while (ifHeader.length) {
      const resourceMatch = ifHeader.match(matchResource);
      const listMatch = ifHeader.match(matchList);

      if (resourceMatch) {
        if (!startedWithResource) {
          throw new Error(
            'Tagged-lists and no-tag-lists must not be mixed in the If header.'
          );
        }

        const resource = resourceMatch[0].trim();
        currentResource = resource.slice(1, -1);
        if (currentResource.match(/(?:^\/)\.\.?(?:$|\/)/)) {
          throw new Error(
            'Resource URIs in the If header must not contain dot segments.'
          );
        }
        ifHeader = ifHeader.replace(matchResource, '');
      } else if (listMatch) {
        let list = listMatch[0].trim().slice(1, -1).trim();
        const listObj: List = {
          tokens: [],
          etags: [],
          nolock: false,
          notTokens: [],
          notEtags: [],
          notNolock: false,
        };

        if (list === '') {
          throw new Error(
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
            throw new Error(
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
        throw new Error(
          "The server doesn't recognize the submitted If header."
        );
      }
    }

    if (Object.keys(parsedHeader).length === 0) {
      throw new Error(
        'The If header, if provided, must contain at least one list with a condition.'
      );
    }

    // Now evaluate the parsed header and check for a single list that passes.
    // The spec states that the entire header evaluates to true if a single list
    // production evaluates to true.
    for (let [resourceUri, lists] of Object.entries(parsedHeader)) {
      const url = new URL(resourceUri, requestURL);
      const { etag, tokens } = resources.find(
        (resource) => resource.url.toString() === url.toString()
      ) || { etag: '', tokens: [] as string[] };

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
        return true;
      }
    }

    return false;
  };

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/file'),
      `(<urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed>)`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'eeee',
          tokens: ['urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'],
        },
      ]
    )
  );

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/file'),
      `(<urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed>\n ["I am an ETag"])\n (["I am another ETag"])`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'I am an ETag',
          tokens: ['urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'],
        },
      ]
    )
  );

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/file'),
      `(<urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed> ["I am an ETag"]) (["I am another ETag"])`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'I am another ETag',
          tokens: [],
        },
      ]
    )
  );

  console.log(
    'should be false: ',
    await parse(
      new URL('http://example.com/file'),
      `(<urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed> ["I am an ETag"]) (["I am another ETag"])`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'I am an ETag',
          tokens: [],
        },
      ]
    )
  );

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/file'),
      `(Not <urn:uuid:9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d> <urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed>)`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'eeee',
          tokens: ['urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'],
        },
      ]
    )
  );

  console.log(
    'should be false: ',
    await parse(
      new URL('http://example.com/file'),
      `(Not <urn:uuid:9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d> Not <urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed>)`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'eeee',
          tokens: ['urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'],
        },
      ]
    )
  );

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/file'),
      `(<urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed>)\n (Not <DAV:no-lock>)`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'eeee',
          tokens: ['urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'],
        },
      ]
    )
  );

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/file'),
      `(<urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed>)\n (Not <DAV:no-lock>)`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'eeee',
          tokens: [],
        },
      ]
    )
  );

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/file'),
      `</file> (<urn:uuid:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed>)\n </file2> (<urn:uuid:9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d>)`,
      [
        {
          url: new URL('http://example.com/file'),
          etag: 'eeee',
          tokens: [],
        },
        {
          url: new URL('http://example.com/file2'),
          etag: 'eeee',
          tokens: ['urn:uuid:9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'],
        },
      ]
    )
  );

  console.log(
    'should be false: ',
    await parse(
      new URL('http://example.com/collection/file'),
      `</collection/file> (["etag"])`,
      [
        {
          url: new URL('http://example.com/collection'),
          etag: 'eeee',
          tokens: [],
        },
      ]
    )
  );

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/collection/file'),
      `</collection/file> (["etag"])`,
      [
        {
          url: new URL('http://example.com/collection'),
          etag: 'eeee',
          tokens: [],
        },
        {
          url: new URL('http://example.com/collection/file'),
          etag: 'etag',
          tokens: [],
        },
      ]
    )
  );

  console.log(
    'should be true: ',
    await parse(
      new URL('http://example.com/collection/file'),
      `</collection/file> (Not ["etag"])`,
      [
        {
          url: new URL('http://example.com/collection'),
          etag: 'eeee',
          tokens: [],
        },
      ]
    )
  );
};
await parseIfHeader();

const parseproppatch = async () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:propertyupdate xmlns:D="DAV:" xmlns:Z="http://ns.example.com/standards/z39.50">
  <D:set>
    <D:prop>
      <Z:Authors>
        <Z:Author>Jim Whitehead</Z:Author>
        <Z:Author>Roy Fielding</Z:Author>
      </Z:Authors>
    </D:prop>
  </D:set>
  <D:remove>
    <D:prop>
      <Z:Copyright-Owner/>
    </D:prop>
  </D:remove>
  <D:set>
    <D:prop>
      <Z:Authors>
        <Z:Author>Nully McNullface</Z:Author>
      </Z:Authors>
    </D:prop>
  </D:set>
  <D:remove>
    <D:prop>
      <Z:Copyright-Owner/>
    </D:prop>
  </D:remove>
  <D:remove>
    <D:prop>
      <Z:Copyright-Owner/>
    </D:prop>
  </D:remove>
</D:propertyupdate>
`;

  const method = new Method({} as Adapter, defaults);
  // const parsed = await parser.parseStringPromise(xml);
  const { output: parsed } = await method.parseXml(xml);

  console.log(inspect(parsed, false, null));
};
// await parseproppatch();

const parsexml = async () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xml:lang="en">
  <D:prop xmlns:R="http://ns.example.com/boxschema/">
    <R:bigbox R:someattr="yes" D:otherattr="no" lastattr="maybe">
    test
    </R:bigbox>
    <R:author/>
    <R:DingALing/>
    <Random xmlns="http://ns.example.com/boxschema/" attrib="yes"/>
  </D:prop>
</D:propfind>
`;

  const method = new Method({} as Adapter, defaults);
  // const parsed = await parser.parseStringPromise(xml);
  const { output: parsed } = await method.parseXml(xml);

  // console.log(inspect(parsed, false, null));

  let testxml = await method.renderXml(parsed);

  console.log(testxml);
};
// await parsexml();

const multistatuspropstat = async () => {
  const multistatus = new MultiStatus();

  const container = new Status(
    new URL('http://www.example.com/container'),
    207
  );
  multistatus.addStatus(container);

  const containerProps = new PropStatStatus(200);
  containerProps.setProp({ test: ['value'] });
  container.addPropStatStatus(containerProps);

  const containerErrorProps = new PropStatStatus(403);
  containerErrorProps.description =
    'The user does not have access to the "restricted" property.';
  containerErrorProps.setProp({ restricted: {} });
  container.addPropStatStatus(containerErrorProps);

  const file = new Status(
    new URL('http://www.example.com/container/file'),
    207
  );
  multistatus.addStatus(file);

  const fileProps = new PropStatStatus(200);
  fileProps.setProp({ prop1: ['success'], prop2: ['more success'] });
  file.addPropStatStatus(fileProps);

  console.log(multistatus.render());
};
// await multistatuspropstat();

const multistatuserror = async () => {
  const multistatus = new MultiStatus();

  const success = new Status(new URL('http://www.example.com/file'), 200);
  multistatus.addStatus(success);
  const error = new Status(new URL('http://www.example.com/file2'), 404);
  error.setBody({
    error: {
      something: {},
    },
  });
  multistatus.addStatus(error);

  console.log(multistatus.render());
};
// await multistatuserror();

const testbuilder = async () => {
  let obj = {
    multistatus: {
      $: {
        xmlns: 'DAV:',
      },
      subarrays: [[{ href: 'abc' }, { href: 'def' }]],
      toparrays: [{ href: 'abc' }, { href: 'def' }],
      response: [
        {
          href: { _: '/container/' },
          propstat: {
            prop: {
              $: {
                'xmlns:R': 'http://ns.example.com/boxschema/',
              },
              'R:bigbox': {
                'R:BoxType': { _: 'Box type A' },
              },
              'R:author': {
                'R:Name': { _: 'Hadrian' },
              },
              creationdate: { _: '1997-12-01T17:42:21-08:00' },
              displayname: { _: 'Example collection' },
              resourcetype: { collection: {} },
              supportedlock: {
                lockentry: [
                  {
                    lockscope: { exclusive: {} },
                    locktype: { write: {} },
                  },
                  {
                    lockscope: { shared: {} },
                    locktype: { write: {} },
                  },
                ],
              },
            },
            status: { _: 'HTTP/1.1 200 OK' },
          },
        },
        {
          href: { _: '/container/front.html' },
          propstat: {
            prop: {
              $: {
                'xmlns:R': 'http://ns.example.com/boxschema/',
              },
              'R:bigbox': {
                'R:BoxType': { _: 'Box type B' },
              },
              creationdate: { _: '1997-12-01T18:27:21-08:00' },
              displayname: { _: 'Example HTML resource' },
              getcontentlength: { _: '4525' },
              getcontenttype: { _: 'text/html' },
              getetag: { _: 'zzyzx' },
              getlastmodified: { _: 'Mon, 12 Jan 1998 09:25:56 GMT' },
              resourcetype: {},
              supportedlock: {
                lockentry: [
                  {
                    lockscope: { exclusive: {} },
                    locktype: { write: {} },
                  },
                  {
                    lockscope: { shared: {} },
                    locktype: { write: {} },
                  },
                ],
              },
            },
            status: { _: 'HTTP/1.1 200 OK' },
          },
        },
      ],
    },
  };

  let xml = builder.buildObject(obj);

  console.log(xml);
  console.log(inspect(await parser.parseStringPromise(xml), false, null));
};
// await testbuilder();
