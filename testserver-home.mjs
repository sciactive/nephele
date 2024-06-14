/**
 * This file requires the --experimental-specifier-resolution=node option.
 *
 * sudo node --experimental-specifier-resolution=node testserver-home.mjs
 */
import { hostname } from 'node:os';
import express from 'express';
import createDebug from 'debug';
import { homedir as userHomePath } from 'userhomepath';

import server from './packages/nephele/dist/index.js';
import FileSystemAdapter from './packages/adapter-file-system/dist/index.js';
import VirtualAdapter from './packages/adapter-virtual/dist/index.js';
import PamAuthenticator from './packages/authenticator-pam/dist/index.js';

const debug = createDebug('nephele:testserver-home');

const app = express();
const host = hostname();
const port = 8080;
const instanceDate = new Date();

app.use(
  '/',
  server({
    adapter: async (_request, response) => {
      if (response.locals.user == null) {
        return new VirtualAdapter({
          files: {
            properties: {
              creationdate: instanceDate,
              getlastmodified: instanceDate,
              owner: 'root',
            },
            locks: {},
            children: [],
          },
        });
      }

      try {
        const homedir = await userHomePath(response.locals.user.username);
        return new FileSystemAdapter({ root: homedir });
      } catch (e) {
        throw new Error("Couldn't mount user directory as server root.");
      }
    },
    authenticator: new PamAuthenticator(),
  }),
);

app.listen(port, () => {
  debug(`Listening on ${host}:${port}.`);
  debug(`Serving files from user home directories.`);
  console.log(`Example Nephele WebDAV server listening on port ${port}`);
});
