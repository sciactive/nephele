/**
 * npx tsx testserver.ts testroot
 */
import { hostname } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request } from 'express';
import express from 'express';
import createDebug from 'debug';

import type { AuthResponse, Plugin } from './packages/nephele/dist/index.js';
import server from './packages/nephele/dist/index.js';
import FileSystemAdapter from './packages/adapter-file-system/dist/index.js';
import VirtualAdapter from './packages/adapter-virtual/dist/index.js';
import S3Adapter from './packages/adapter-s3/dist/index.js';
import PamAuthenticator from './packages/authenticator-pam/dist/index.js';
import HtpasswdAuthenticator from './packages/authenticator-htpasswd/dist/index.js';
import CustomAuthenticator, {
  User as CustomUser,
} from './packages/authenticator-custom/dist/index.js';
import InsecureAuthenticator from './packages/authenticator-none/dist/index.js';
import IndexPlugin from './packages/plugin-index/dist/index.js';
import ReadOnlyPlugin from './packages/plugin-read-only/dist/index.js';
import EncryptionPlugin from './packages/plugin-encryption/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const debug = createDebug('nephele:testserver');

const app = express();
const host = hostname();
const port = 8080;
const root = process.argv.length > 2 ? resolve(process.argv[2]) : __dirname;
const readonly = !!process.env.READONLY;
const htpasswd = !!process.env.HTPASSWD;
const pam = !process.env.NOPAM;
const unauthorized = !!process.env.UNAUTHORIZED;
const virtual = !!process.env.VIRTUALFS;
const s3Endpoint = process.env.S3ENDPOINT;
const s3Region = process.env.S3REGION ?? 'us-east-1';
const s3AccessKey = process.env.S3ACCESSKEY;
const s3SecretKey = process.env.S3SECRETKEY;
const s3Bucket = process.env.S3BUCKET;
const envuser = process.env.USERNAME || process.env.USER;
const envpass = process.env.PASSWORD;
const userpassdefined = !!(envuser && envpass);
const encryption = process.env.ENCRYPTION;
const userDirs = !!process.env.USERDIRS;
const WEBROOT = process.env.WEBROOT || '/';

app.use(
  WEBROOT,
  server({
    adapter: async (_request, response) =>
      virtual
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
        : s3Endpoint && s3AccessKey && s3SecretKey && s3Bucket
          ? new S3Adapter({
              s3Config: {
                endpoint: s3Endpoint,
                region: s3Region,
                credentials: {
                  accessKeyId: s3AccessKey,
                  secretAccessKey: s3SecretKey,
                },
              },
              bucket: s3Bucket,
              root:
                userDirs && response.locals.user
                  ? response.locals.user.username
                  : '',
            })
          : new FileSystemAdapter({
              root:
                userDirs && response.locals.user
                  ? join(root, response.locals.user.username)
                  : root,
            }),
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
      : htpasswd
        ? new HtpasswdAuthenticator({
            unauthorizedAccess: unauthorized,
          })
        : pam
          ? new PamAuthenticator({
              unauthorizedAccess: unauthorized,
            })
          : new InsecureAuthenticator(),
    plugins: async (_request, response) => {
      const isReadonly =
        readonly ||
        (unauthorized &&
          (response.locals.user == null ||
            response.locals.user.username == 'nobody'));
      const plugins: Plugin[] = [
        new IndexPlugin({ showForms: !isReadonly }),
        simpleLogPlugin(),
      ];

      if (isReadonly) {
        plugins.push(new ReadOnlyPlugin());
      }

      if (encryption) {
        plugins.push(
          new EncryptionPlugin({
            salt: '5de338e9a6c8465591821c4f5e1c5acf',
            filenameSalt: '3ac159a27a3342c0bb106affac46812f',
            filenameIVSalt: '7f3bf86e561d46bcbba06702eb0d7718',
            exclude: ['/.htpasswd'],
            ...(htpasswd || pam ? {} : { globalPassword: encryption }),
          }),
        );
      }

      return plugins;
    },
  }),
);

app.listen(port, (err) => {
  if (err) {
    console.error(err);
    return;
  }
  debug(`Listening on ${host}:${port}.`);
  debug(`Serving files from ${virtual ? 'RAM' : `"${root}"`}.`);
  console.log(`Example Nephele WebDAV server listening on port ${port}`);
});

function simpleLogPlugin() {
  return {
    async prepare(request: Request, _res: AuthResponse) {
      console.log('prepare', request.url);
    },
    async beforeAuth(request: Request, _res: AuthResponse) {
      console.log('beforeAuth', request.url);
    },
    async afterAuth(request: Request, _res: AuthResponse) {
      console.log('afterAuth', request.url);
    },
    async begin(request: Request, _res: AuthResponse) {
      console.log('begin', request.url);
    },
    async close(request: Request, _res: AuthResponse) {
      console.log('close', request.url);
    },
    async beforeCheckAuthorization(request: Request, _res: AuthResponse) {
      console.log('beforeCheckAuthorization', request.url);
    },
    async afterCheckAuthorization(request: Request, _res: AuthResponse) {
      console.log('afterCheckAuthorization', request.url);
    },
    async beginGet(request: Request, _res: AuthResponse) {
      console.log('beginGet', request.url);
    },
    async preGet(request: Request, _res: AuthResponse) {
      console.log('preGet', request.url);
    },
    async beforeGet(request: Request, _res: AuthResponse) {
      console.log('beforeGet', request.url);
    },
    async afterGet(request: Request, _res: AuthResponse) {
      console.log('afterGet', request.url);
    },
    async beginHead(request: Request, _res: AuthResponse) {
      console.log('beginHead', request.url);
    },
    async preHead(request: Request, _res: AuthResponse) {
      console.log('preHead', request.url);
    },
    async beforeHead(request: Request, _res: AuthResponse) {
      console.log('beforeHead', request.url);
    },
    async afterHead(request: Request, _res: AuthResponse) {
      console.log('afterHead', request.url);
    },
    async beginCopy(request: Request, _res: AuthResponse) {
      console.log('beginCopy', request.url);
    },
    async preCopy(request: Request, _res: AuthResponse) {
      console.log('preCopy', request.url);
    },
    async beforeCopy(request: Request, _res: AuthResponse) {
      console.log('beforeCopy', request.url);
    },
    async afterCopy(request: Request, _res: AuthResponse) {
      console.log('afterCopy', request.url);
    },
    async beginDelete(request: Request, _res: AuthResponse) {
      console.log('beginDelete', request.url);
    },
    async preDelete(request: Request, _res: AuthResponse) {
      console.log('preDelete', request.url);
    },
    async beforeDelete(request: Request, _res: AuthResponse) {
      console.log('beforeDelete', request.url);
    },
    async afterDelete(request: Request, _res: AuthResponse) {
      console.log('afterDelete', request.url);
    },
    async beginLock(request: Request, _res: AuthResponse) {
      console.log('beginLock', request.url);
    },
    async preLock(request: Request, _res: AuthResponse) {
      console.log('preLock', request.url);
    },
    async preLockRefresh(request: Request, _res: AuthResponse) {
      console.log('preLockRefresh', request.url);
    },
    async beforeLockRefresh(request: Request, _res: AuthResponse) {
      console.log('beforeLockRefresh', request.url);
    },
    async beforeLockProvisional(request: Request, _res: AuthResponse) {
      console.log('beforeLockProvisional', request.url);
    },
    async beforeLock(request: Request, _res: AuthResponse) {
      console.log('beforeLock', request.url);
    },
    async afterLock(request: Request, _res: AuthResponse) {
      console.log('afterLock', request.url);
    },
    async beginMkcol(request: Request, _res: AuthResponse) {
      console.log('beginMkcol', request.url);
    },
    async preMkcol(request: Request, _res: AuthResponse) {
      console.log('preMkcol', request.url);
    },
    async beforeMkcol(request: Request, _res: AuthResponse) {
      console.log('beforeMkcol', request.url);
    },
    async afterMkcol(request: Request, _res: AuthResponse) {
      console.log('afterMkcol', request.url);
    },
    async beginMove(request: Request, _res: AuthResponse) {
      console.log('beginMove', request.url);
    },
    async preMove(request: Request, _res: AuthResponse) {
      console.log('preMove', request.url);
    },
    async beforeMove(request: Request, _res: AuthResponse) {
      console.log('beforeMove', request.url);
    },
    async afterMove(request: Request, _res: AuthResponse) {
      console.log('afterMove', request.url);
    },
    async beginOptions(request: Request, _res: AuthResponse) {
      console.log('beginOptions', request.url);
    },
    async preOptions(request: Request, _res: AuthResponse) {
      console.log('preOptions', request.url);
    },
    async beforeOptions(request: Request, _res: AuthResponse) {
      console.log('beforeOptions', request.url);
    },
    async afterOptions(request: Request, _res: AuthResponse) {
      console.log('afterOptions', request.url);
    },
    async beginPropfind(request: Request, _res: AuthResponse) {
      console.log('beginPropfind', request.url);
    },
    async prePropfind(request: Request, _res: AuthResponse) {
      console.log('prePropfind', request.url);
    },
    async beforePropfind(request: Request, _res: AuthResponse) {
      console.log('beforePropfind', request.url);
    },
    async afterPropfind(request: Request, _res: AuthResponse) {
      console.log('afterPropfind', request.url);
    },
    async beginProppatch(request: Request, _res: AuthResponse) {
      console.log('beginProppatch', request.url);
    },
    async preProppatch(request: Request, _res: AuthResponse) {
      console.log('preProppatch', request.url);
    },
    async beforeProppatch(request: Request, _res: AuthResponse) {
      console.log('beforeProppatch', request.url);
    },
    async afterProppatch(request: Request, _res: AuthResponse) {
      console.log('afterProppatch', request.url);
    },
    async beginPut(request: Request, _res: AuthResponse) {
      console.log('beginPut', request.url);
    },
    async prePut(request: Request, _res: AuthResponse) {
      console.log('prePut', request.url);
    },
    async beforePut(request: Request, _res: AuthResponse) {
      console.log('beforePut', request.url);
    },
    async afterPut(request: Request, _res: AuthResponse) {
      console.log('afterPut', request.url);
    },
    async beginUnlock(request: Request, _res: AuthResponse) {
      console.log('beginUnlock', request.url);
    },
    async preUnlock(request: Request, _res: AuthResponse) {
      console.log('preUnlock', request.url);
    },
    async beforeUnlock(request: Request, _res: AuthResponse) {
      console.log('beforeUnlock', request.url);
    },
    async afterUnlock(request: Request, _res: AuthResponse) {
      console.log('afterUnlock', request.url);
    },
    async beginMethod(request: Request, _res: AuthResponse) {
      console.log('beginMethod', request.url);
    },
    async preMethod(request: Request, _res: AuthResponse) {
      console.log('preMethod', request.url);
    },
    async beforeMethod(request: Request, _res: AuthResponse) {
      console.log('beforeMethod', request.url);
    },
    async afterMethod(request: Request, _res: AuthResponse) {
      console.log('afterMethod', request.url);
    },
  };
}
