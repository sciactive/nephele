/**
 * This file requires the --experimental-specifier-resolution=node option.
 *
 * node --experimental-specifier-resolution=node testserver.js
 */

import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import server from './dist/index.js';
import FileSystemAdapter from './dist/FileSystemAdapter/Adapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const host = hostname();
const port = 8080;
const path = '/';
const root = __dirname;

app.use(
  '/',
  server(
    new FileSystemAdapter({
      host,
      port,
      path,
      root,
    })
  )
);

app.listen(port, () => {
  console.log(`Example Nephele WebDAV server listening on port ${port}`);
});
