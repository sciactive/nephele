/**
 * This file requires the --experimental-specifier-resolution=node option.
 *
 * env NODE_OPTIONS='--experimental-specifier-resolution=node' npx ts-node --esm testserver.ts
 */
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import createDebug from 'debug';

import server from './packages/nephele/dist/index.js';
import FileSystemAdapter from './packages/adapter-file-system/dist/index.js';
import PamAuthenticator from './packages/authenticator-pam/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const debug = createDebug('nephele:testserver');

const app = express();
const host = hostname();
const port = 8080;
const root = process.argv.length > 2 ? resolve(process.argv[2]) : __dirname;
const pam = !process.env.NOPAM;

app.use(
  '/',
  server({
    adapter: new FileSystemAdapter({
      root,
      usernamesMapToSystemUsers: pam,
    }),
    authenticator: new PamAuthenticator(),
  })
);

app.listen(port, () => {
  debug(`Listening on ${host}:${port}.`);
  debug(`Serving files from "${root}".`);
  console.log(`Example Nephele WebDAV server listening on port ${port}`);
});
