/**
 * This file requires the --experimental-specifier-resolution=node option.
 *
 * env NODE_OPTIONS='--experimental-specifier-resolution=node' npx ts-node --esm testserver.ts testroot
 */
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request } from 'express';
import express from 'express';
import createDebug from 'debug';

import type { AuthResponse } from './packages/nephele/dist/index.js';
import server from './packages/nephele/dist/index.js';
import FileSystemAdapter from './packages/adapter-file-system/dist/index.js';
import VirtualAdapter from './packages/adapter-virtual/dist/index.js';
import PamAuthenticator from './packages/authenticator-pam/dist/index.js';
import CustomAuthenticator, {
  User as CustomUser,
} from './packages/authenticator-custom/dist/index.js';
import InsecureAuthenticator from './packages/authenticator-none/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const debug = createDebug('nephele:testserver');

const app = express();
const host = hostname();
const port = 8080;
const root = process.argv.length > 2 ? resolve(process.argv[2]) : __dirname;
const pam = !process.env.NOPAM;
const virtual = !!process.env.VIRTUALFS;
const envuser = process.env.USERNAME || process.env.USER;
const envpass = process.env.PASSWORD;
const userpassdefined = !!(envuser && envpass);

app.use(
  '/',
  server({
    adapter: virtual
      ? new VirtualAdapter({
          files: {
            properties: {
              creationdate: new Date(),
              getlastmodified: new Date(),
            },
            locks: {},
            children: [],
          },
        })
      : new FileSystemAdapter({ root }),
    authenticator: userpassdefined
      ? new CustomAuthenticator({
          getUser: async (username) => {
            if (username === envuser) {
              return new CustomUser({ username });
            }
            return null;
          },
          authBasic: async (user, password) => {
            if (user.username === envuser && password === envpass) {
              return true;
            }
            return false;
          },
        })
      : pam
      ? new PamAuthenticator()
      : new InsecureAuthenticator(),
    plugins: [
      {
        async prepare(_req: Request, _res: AuthResponse) {
          console.log('prepare');
        },
      },
    ],
  })
);

app.listen(port, () => {
  debug(`Listening on ${host}:${port}.`);
  debug(`Serving files from ${virtual ? 'RAM' : `"${root}"`}.`);
  console.log(`Example Nephele WebDAV server listening on port ${port}`);
});
