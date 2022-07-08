import path from 'node:path';
import { fileURLToPath } from 'node:url';
import xml2js from 'xml2js';
import validator from 'xsd-schema-validator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let validate = async (input: string) =>
  await new Promise((resolve, reject) => {
    validator.validateXML(
      input,
      path.resolve(__dirname, '../resources/webdav.xsd'),
      (err, result) => {
        if (err) {
          reject(err);
        }

        resolve(result.valid);
      }
    );
  });

let builder = new xml2js.Builder({
  xmldec: { version: '1.0', encoding: 'UTF-8' },
});

let obj = {
  multistatus: {
    $: {
      xmlns: 'DAV:',
    },
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

console.log(await validate(xml));
