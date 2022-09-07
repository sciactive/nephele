/**
 * This file requires the --experimental-specifier-resolution=node option.
 *
 * env NODE_OPTIONS='--experimental-specifier-resolution=node' npx ts-node --esm testserver-multi.ts testroot
 */
import { hostname } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs, { constants } from 'node:fs';
import express from 'express';
import createDebug from 'debug';

import server from './packages/nephele/dist/index.js';
import FileSystemAdapter from './packages/adapter-file-system/dist/index.js';
import VirtualAdapter from './packages/adapter-virtual/dist/index.js';
import PamAuthenticator from './packages/authenticator-pam/dist/index.js';
import InsecureAuthenticator from './packages/authenticator-none/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const debug = createDebug('nephele:testserver-multi');

const app = express();
const host = hostname();
const port = 8080;
const root = process.argv.length > 2 ? resolve(process.argv[2]) : __dirname;
const pam = !process.env.NOPAM;
const instanceDate = new Date();

try {
  fs.accessSync(join(root, 'First'), constants.F_OK);
} catch (e) {
  fs.mkdirSync(join(root, 'First'));
}
try {
  fs.accessSync(join(root, 'Second'), constants.F_OK);
} catch (e) {
  fs.mkdirSync(join(root, 'Second'));
}

app.use(
  '/',
  server({
    adapter: async (_request, _response) => {
      return {
        '/': new VirtualAdapter({
          files: {
            properties: {
              creationdate: instanceDate,
              getlastmodified: instanceDate,
              owner: 'root',
            },
            locks: {},
            children: [
              {
                name: 'Directory (1)',
                properties: {
                  creationdate: instanceDate,
                  getlastmodified: instanceDate,
                  owner: 'root',
                },
                locks: {},
                children: [],
              },
              {
                name: 'Directory (2)',
                properties: {
                  creationdate: instanceDate,
                  getlastmodified: instanceDate,
                  owner: 'root',
                },
                locks: {},
                children: [],
              },
            ],
          },
        }),
        '/Directory (1)/': new FileSystemAdapter({
          root: join(root, 'First'),
          usernamesMapToSystemUsers: pam,
        }),
        '/Directory (2)/': new FileSystemAdapter({
          root: join(root, 'Second'),
          usernamesMapToSystemUsers: pam,
        }),
      };
    },
    authenticator: pam ? new PamAuthenticator() : new InsecureAuthenticator(),
  })
);

app.listen(port, () => {
  debug(`Listening on ${host}:${port}.`);
  debug(
    `Serving files from user "${join(root, 'First')}" and "${join(
      root,
      'Second'
    )}" directories.`
  );
  console.log(`Example Nephele WebDAV server listening on port ${port}`);
});
