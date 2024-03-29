import type { Server } from 'node:http';
import https from 'node:https';
import http from 'node:http';
import { networkInterfaces, hostname } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { program, Option } from 'commander';
import express from 'express';
import type { Adapter } from 'nephele';
import nepheleServer, { ResourceNotFoundError } from 'nephele';
import FileSystemAdapter from '@nephele/adapter-file-system';
import S3Adapter from '@nephele/adapter-s3';
import VirtualAdapter from '@nephele/adapter-virtual';
import CustomAuthenticator, {
  User as CustomUser,
} from '@nephele/authenticator-custom';
import HtpasswdAuthenticator from '@nephele/authenticator-htpasswd';
import InsecureAuthenticator from '@nephele/authenticator-none';
import IndexPlugin from '@nephele/plugin-index';
import EncryptionPlugin from '@nephele/plugin-encryption';
import updateNotifier from 'update-notifier';

type Hosts = {
  name: string;
  family: string;
  address: string;
}[];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json')).toString()
);

type Conf = {
  host: string;
  realm?: string;
  cert?: string;
  key?: string;
  port?: number;
  redirectPort?: number;
  timeout?: number;
  keepAliveTimeout?: number;
  homeDirectories: boolean;
  userDirectories: boolean;
  serveIndexes: boolean;
  serveListings: boolean;
  auth: boolean;
  pamAuth: boolean;
  authUserFilename?: string;
  authUserFile?: string;
  authUsername?: string;
  authPassword?: string;
  encryption: boolean;
  encryptionSalt?: string;
  encryptionFilenameSalt?: string;
  encryptionFilenameIvSalt?: string;
  encryptionFilenameEncoding?: 'base64' | 'ascii85';
  encryptionGlobalPassword?: string;
  encryptionExclude?: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Bucket?: string;
  updateCheck: boolean;
  directory?: string;
};

program
  .name(pkg.name)
  .description(pkg.description)
  .version(pkg.version, '-v, --version', 'Print the current version');

program
  .option(
    '-h, --host <host>',
    'A host address to listen on. The default is to listen on all external hosts.',
    '::'
  )
  .option(
    '-r, --realm <realm>',
    'The realm reported to the user by the server when authentication is requested. Defaults to the system hostname.'
  )
  .option(
    '--cert <cert_file>',
    'The filename of a certificate to use for HTTPS in PEM format.'
  )
  .option(
    '--key <key_file>',
    'The filename of a private key to use for HTTPS in PEM format.'
  )
  .addOption(
    new Option(
      '-p, --port <port>',
      'The port to listen on. Defaults to 443 if a cert is provided, 80 otherwise.'
    ).argParser(parseInt)
  )
  .addOption(
    new Option(
      '--redirect-port <redirect_port>',
      'The port to redirect HTTP traffic to HTTPS. Set this to 80 if you want to redirect plain HTTP requests.'
    ).argParser(parseInt)
  )
  .addOption(
    new Option(
      '-t, --timeout <milliseconds>',
      'Request timeout. Requests will be terminated if they take longer than this time. Defaults to 7200000, or 2 hours.'
    ).argParser(parseInt)
  )
  .addOption(
    new Option(
      '--keep-alive-timeout <milliseconds>',
      'Server will wait this long for additional data after writing its last response.'
    ).argParser(parseInt)
  )
  .option(
    '--home-directories',
    "Serve users' home directories to them when they log in. (Impies --pam-auth.)"
  )
  .option(
    '--user-directories',
    'Serve users their own directory under the server root when they log in.'
  )
  .option(
    '--serve-indexes',
    'Serve index.html and index.htm files when the user requests a directory.'
  )
  .option(
    '--serve-listings',
    'Serve directory listings with file management forms when the user requests a directory.'
  )
  .option(
    '--no-auth',
    "Don't require authentication. (Not compatible with --home-directories or --user-directories.)"
  )
  .option('--pam-auth', 'Use PAM authentication. (Requires PAM libraries.)')
  .option(
    '--auth-user-filename',
    "htpasswd filename. (Defaults to '.htpasswd'.)"
  )
  .option(
    '--auth-user-file',
    'A specific htpasswd file to use for every request.'
  )
  .option(
    '--auth-username <username>',
    'Authenticate with a given username instead.'
  )
  .option(
    '--auth-password <password>',
    'Authenticate with a given password instead.'
  )
  .option('--encryption', 'Enable filename and file contents encryption.')
  .option(
    '--encryption-salt <salt>',
    'The salt used to generate file content encryption keys.'
  )
  .option(
    '--encryption-filename-salt <salt>',
    'The salt used to generate filename encryption keys.'
  )
  .option(
    '--encryption-filename-iv-salt <salt>',
    'The salt used to generate filename initialization vectors.'
  )
  .option(
    '--encryption-filename-encoding <encoding>',
    "The encoding to use for filenames ('base64' or 'ascii85')."
  )
  .option(
    '--encryption-global-password <password>',
    'A password to use globally instead of user passwords.'
  )
  .option(
    '--encryption-exclude <globlist>',
    'A list of glob patterns to exclude from the encryption/decryption process.'
  )
  .option('--s3-endpoint <endpoint-url>', 'The S3 endpoint URL to connect to.')
  .option('--s3-region <region>', 'The S3 region.')
  .option('--s3-access-key <access-key>', 'The S3 access key.')
  .option('--s3-secret-key <secret-key>', 'The S3 secret key.')
  .option('--s3-bucket <bucket-name>', 'The S3 bucket.')
  .option('--no-update-check', "Don't check for updates.")
  .argument(
    '[directory]',
    'The path of the directory to use as the server root. When using S3, this is the path within the bucket.'
  );

program.addHelpText(
  'after',
  `
Environment Variables:
  HOST                                       Same as --host.
  PORT                                       Same as --port.
  REDIRECT_PORT                              Same as --redirect-port.
  TIMEOUT                                    Same as --timeout.
  KEEPALIVETIMEOUT                           Same as --keep-alive-timeout.
  REALM                                      Same as --realm.
  CERT_FILE                                  Same as --cert.
  CERT                                       Text of a cert in PEM format.
  KEY_FILE                                   Same as --key.
  KEY                                        Text of a key in PEM format.
  HOME_DIRECTORIES                           Same as --home-directories when set to "true", "on" or "1".
  USER_DIRECTORIES                           Same as --user-directories when set to "true", "on" or "1".
  SERVE_INDEXES                              Same as --serve-indexes when set to "true", "on" or "1".
  SERVE_LISTINGS                             Same as --serve-listings when set to "true", "on" or "1".
  AUTH                                       Same as --no-auth when set to "false", "off" or "0".
  PAM_AUTH                                   Same as --pam-auth when set to "true", "on" or "1".
  AUTH_USER_FILENAME                         Same as --auth-user-filename.
  AUTH_USER_FILE                             Same as --auth-user-file.
  AUTH_USERNAME                              Same as --auth-username.
  AUTH_PASSWORD                              Same as --auth-password.
  ENCRYPTION                                 Same as --encryption when set to "true", "on" or "1".
  ENCRYPTION_SALT                            Same as --encryption-salt.
  ENCRYPTION_FILENAME_SALT                   Same as --encryption-filename-salt.
  ENCRYPTION_FILENAME_IV_SALT                Same as --encryption-filename-iv-salt.
  ENCRYPTION_FILENAME_ENCODING               Same as --encryption-filename-encoding.
  ENCRYPTION_GLOBAL_PASSWORD                 Same as --encryption-global-password.
  ENCRYPTION_EXCLUDE                         Same as --encryption-exclude.
  S3_ENDPOINT                                Same as --s3-endpoint.
  S3_REGION                                  Same as --s3-region.
  S3_ACCESS_KEY                              Same as --s3-access-key.
  S3_SECRET_KEY                              Same as --s3-secret-key.
  S3_BUCKET                                  Same as --s3-bucket.
  UPDATE_CHECK                               Same as --no-update-check when set to "false", "off" or "0".
  SERVER_ROOT                                Same as [directory].

Options given on the command line take precedence over options from an environment variable.`
);

program.addHelpText(
  'after',
  `
Encryption:
  Nephele supports file encryption. It uses either a global encryption password
  or user passwords to encrypt your files.

  To enable encryption, set the encryption option and provide three long,
  random, unique strings for the salt, filename salt, and filename IV salt. You
  can generate long random strings here: https://www.uuidgenerator.net/

  If you use username passwords for encryption, you can't change a user's
  password or their files will no longer be accessible.

  If you disable auth, you must set a global encryption password to use
  encryption. If you then change this global password, your files will no longer
  be accessible.

  Likewise, if you change any of the salts, your files will no longer be
  accessible.

  You also have a choice of filename encodings. You can set this to 'ascii85' if
  you know your file system supports non UTF-8 filenames. This will allow files
  with longer filenames.

  You can also exclude files from encryption by providing a comma separated list
  of glob patterns.

  You can find more information about Nephele's file encryption here:
  https://github.com/sciactive/nephele/blob/master/packages/plugin-encryption/README.md`
);

program.addHelpText(
  'after',
  `
S3 Object Store:
  Nephele supports using an S3 object store as its storage backend.

  S3 and S3 compatible servers are essentially key-value stores. Nephele can
  present this store as a hierarchical file structure by using the file path and
  filename as the key. This is a common practice and is often supported by the
  native object browser of the store.

  By combining an S3 backend with Nephele's encryption feature, you can get the
  benefits of cloud storage while maintaining your privacy and security.

  An important note is that an S3 key has a maximum length of 1024 bytes using
  UTF-8 encoding. This means the entire file path, including the slash
  characters that separate directories, can only be 1024 bytes long, so you may
  run into problems with deeply nested file structures.

  You can find more information about S3 keys here:
  https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html

  WebDAV properties and locks are stored in the metadata of objects. There is no
  support for properties or locks on a directory, since S3 doesn't really have
  "real" directories.

  S3 does not have the concept of an empty directory, since "directories" are
  just common prefixes among keys. As such, Nephele represents an empty
  directory in S3 by creating an empty object under the directory with the name
  ".nepheleempty". It is safe to delete these objects. It is the same as
  deleting the empty directory.

  You can find more information about Nephele's S3 adapter here:
  https://github.com/sciactive/nephele/blob/master/packages/adapter-s3/README.md`
);

program.addHelpText(
  'afterAll',
  `
Nephele repo: https://github.com/sciactive/nephele
Copyright (C) 2022-2024 SciActive, Inc
https://sciactive.com/`
);

try {
  // Parse args.
  if (
    process.argv.length > 2 &&
    process.argv[1].includes('/pm2/') &&
    process.argv.includes('--')
  ) {
    // pm2-runtime command is sometimes given whole and not understood by commander
    // also it doubles the args after --
    const rest = process.argv.slice(process.argv.indexOf('--') + 1);
    if (rest.length > 1 && rest[0] === rest[rest.length / 2]) {
      rest.splice(rest.length / 2, rest.length);
    }
    program.parse([process.argv[0], __filename, ...rest]);
  } else {
    program.parse();
  }
  const options = program.opts();
  let {
    host,
    realm,
    cert,
    key,
    port,
    redirectPort,
    timeout,
    keepAliveTimeout,
    homeDirectories,
    userDirectories,
    serveIndexes,
    serveListings,
    auth,
    pamAuth,
    authUserFilename,
    authUserFile,
    authUsername,
    authPassword,
    encryption,
    encryptionSalt,
    encryptionFilenameSalt,
    encryptionFilenameIvSalt,
    encryptionFilenameEncoding,
    encryptionGlobalPassword,
    encryptionExclude,
    s3Endpoint,
    s3Region,
    s3AccessKey,
    s3SecretKey,
    s3Bucket,
    updateCheck,
    directory,
  } = {
    host: process.env.HOST,
    realm: process.env.REALM || hostname(),
    cert: process.env.CERT_FILE,
    key: process.env.KEY_FILE,
    homeDirectories: ['true', 'on', '1'].includes(
      (process.env.HOME_DIRECTORIES || '').toLowerCase()
    ),
    userDirectories: ['true', 'on', '1'].includes(
      (process.env.USER_DIRECTORIES || '').toLowerCase()
    ),
    serveIndexes: ['true', 'on', '1'].includes(
      (process.env.SERVE_INDEXES || '').toLowerCase()
    ),
    serveListings: ['true', 'on', '1'].includes(
      (process.env.SERVE_LISTINGS || '').toLowerCase()
    ),
    auth: !['false', 'off', '0'].includes(
      (process.env.AUTH || '').toLowerCase()
    ),
    pamAuth: ['true', 'on', '1'].includes(
      (process.env.PAM_AUTH || '').toLowerCase()
    ),
    authUserFilename: process.env.AUTH_USER_FILENAME,
    authUserFile: process.env.AUTH_USER_FILE,
    authUsername: process.env.AUTH_USERNAME,
    authPassword: process.env.AUTH_PASSWORD,
    encryption: ['true', 'on', '1'].includes(
      (process.env.ENCRYPTION || '').toLowerCase()
    ),
    encryptionSalt: process.env.ENCRYPTION_SALT,
    encryptionFilenameSalt: process.env.ENCRYPTION_FILENAME_SALT,
    encryptionFilenameIvSalt: process.env.ENCRYPTION_FILENAME_IV_SALT,
    encryptionFilenameEncoding: process.env.ENCRYPTION_FILENAME_ENCODING,
    encryptionGlobalPassword: process.env.ENCRYPTION_GLOBAL_PASSWORD,
    encryptionExclude: process.env.ENCRYPTION_EXCLUDE,
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Region: process.env.S3_REGION,
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
    s3Bucket: process.env.S3_BUCKET,
    updateCheck: !['false', 'off', '0'].includes(
      (process.env.UPDATE_CHECK || '').toLowerCase()
    ),
    directory: program.args.length
      ? path.resolve(program.args[0])
      : process.env.SERVER_ROOT && path.resolve(process.env.SERVER_ROOT),
    ...options,
  } as Conf;

  if (updateCheck) {
    updateNotifier({ pkg }).notify({ defer: false });
  }

  if (cert) {
    cert = fs.readFileSync(path.resolve(cert)).toString();
  } else {
    cert = process.env.CERT;
  }

  if (key) {
    key = fs.readFileSync(path.resolve(key)).toString();
  } else {
    key = process.env.KEY;
  }

  const secure = !!(cert && key);
  if (port == null) {
    port = parseInt(process.env.PORT || (secure ? '443' : '80'));
  }

  if (redirectPort == null && secure) {
    redirectPort = parseInt(process.env.REDIRECT_PORT || '0');
  }

  if (redirectPort != null && redirectPort <= 0) {
    redirectPort = undefined;
  }

  if (timeout == null) {
    timeout = parseInt(process.env.TIMEOUT || '7200000') || 0;
  }

  if (timeout != null && timeout < 0) {
    timeout = 0;
  }

  if (keepAliveTimeout == null) {
    keepAliveTimeout = process.env.KEEPALIVETIMEOUT
      ? parseInt(process.env.KEEPALIVETIMEOUT)
      : undefined;
  }

  if (keepAliveTimeout != null && keepAliveTimeout < 0) {
    keepAliveTimeout = 0;
  }

  // Validate args.
  if (homeDirectories && userDirectories) {
    throw new Error(
      'Only one of --home-directories and --user-directories options can be used at a time.'
    );
  }

  if (directory != null && homeDirectories) {
    throw new Error("Can't serve both a directory and home directories.");
  }

  if (s3Endpoint != null && homeDirectories) {
    throw new Error("Can't serve home directories using S3.");
  }

  if (userDirectories && directory == null && s3Endpoint == null) {
    throw new Error(
      'Serving user directories requires a root directory or an S3 endpoint.'
    );
  }

  if (directory == null && !homeDirectories && s3Endpoint == null) {
    throw new Error(
      'A root directory, an S3 endpoint, or the --home-directories option is required.'
    );
  }

  if ((homeDirectories || userDirectories) && !auth) {
    throw new Error(
      'The --home-directories and --user-directories options require authentication.'
    );
  }

  if (s3Endpoint != null && s3Region == null) {
    throw new Error('The --s3-region option is required to use S3.');
  }

  if (s3Endpoint != null && s3Bucket == null) {
    throw new Error('The --s3-bucket option is required to use S3.');
  }

  if (homeDirectories) {
    pamAuth = true;
  }

  if (!pamAuth) {
    console.log(
      '\x1b[43m\x1b[37m\x1b[1m%s\x1b[0m\x1b[33m\x1b[1m%s\x1b[0m',
      ' ⚠  ',
      ' BREAKING CHANGE: nephele-serve 1.0.0-alpha.34 and above require the `@nephele/authenticator-pam` package and `--pam-auth` option to authenticate with system users.'
    );
  }

  if (encryption) {
    if (!encryptionSalt) {
      throw new Error('You must provide a salt to use file encryption.');
    }

    if (!encryptionFilenameSalt) {
      throw new Error(
        'You must provide a filename salt to use file encryption.'
      );
    }

    if (!encryptionFilenameIvSalt) {
      throw new Error(
        'You must provide a filename IV salt to use file encryption.'
      );
    }
  }

  if (
    directory != null &&
    s3Endpoint == null &&
    !fs.statSync(directory).isDirectory()
  ) {
    throw new Error('Provided server root is not an accessible directory.');
  }

  // Get server ready.
  const getHosts = () => {
    const ifaces = networkInterfaces();
    let serverHosts: Hosts = [];
    for (let name in ifaces) {
      const netDict = ifaces[name];
      if (netDict == null) {
        continue;
      }
      for (let net of netDict) {
        if (!net.internal && net.address) {
          if (host.trim() !== '::' && host.trim() !== net.address) {
            continue;
          }
          serverHosts.push({ name, family: net.family, address: net.address });
        }
      }
    }
    return serverHosts;
  };

  const serverHosts = getHosts();
  const app = express();
  const instanceDate = new Date();

  if (serverHosts.length === 0) {
    throw new Error('No hosts to listen on.');
  }

  app.use(
    '/',
    nepheleServer({
      adapter: async (_request, response) => {
        if (homeDirectories && response.locals.user == null) {
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
          if (homeDirectories) {
            const { homedir: userHomePath } = await import('userhomepath');
            const root = await userHomePath(response.locals.user.username);
            return new FileSystemAdapter({ root });
          }

          let adapter: Adapter;

          if (s3Endpoint == null) {
            if (directory == null || !fs.statSync(directory).isDirectory()) {
              throw new Error('Server root is not an accessible directory.');
            }

            if (userDirectories && response.locals.user != null) {
              const root = path.join(
                directory,
                response.locals.user.username.replace(/\//g, '_')
              );

              try {
                fs.accessSync(root);
              } catch (e: any) {
                fs.mkdirSync(root);
                if (pamAuth) {
                  const { ids } = await import('userid');
                  const { uid, gid } = ids(response.locals.user.username);
                  fs.chownSync(root, uid, gid);
                  fs.chmodSync(root, 0o750);
                }
              }

              adapter = new FileSystemAdapter({ root });
            } else {
              adapter = new FileSystemAdapter({ root: directory });
            }
          } else {
            if (s3Bucket == null) {
              throw new Error('S3 bucket is required.');
            }

            if (directory) {
              directory = directory
                .split('/')
                .map(encodeURIComponent)
                .join('/');
            }

            adapter = new S3Adapter({
              s3Config: {
                endpoint: s3Endpoint,
                region: s3Region,
                ...(s3AccessKey != null && s3SecretKey != null
                  ? {
                      credentials: {
                        accessKeyId: s3AccessKey,
                        secretAccessKey: s3SecretKey,
                      },
                    }
                  : {}),
              },
              bucket: s3Bucket,
              root: directory,
            });

            if (userDirectories && response.locals.user != null) {
              const userPath = encodeURIComponent(
                response.locals.user.username.replace(/\//g, '_')
              );
              const baseUrl = new URL(`http://localhost/`);
              const url = new URL(userPath, baseUrl);

              try {
                await adapter.getResource(url, baseUrl);
              } catch (e: any) {
                if (!(e instanceof ResourceNotFoundError)) {
                  throw e;
                }

                const userDir = await adapter.newCollection(url, baseUrl);
                await userDir.create(response.locals.user);
              }

              adapter = new S3Adapter({
                s3Config: {
                  endpoint: s3Endpoint,
                  region: s3Region,
                  ...(s3AccessKey != null && s3SecretKey != null
                    ? {
                        credentials: {
                          accessKeyId: s3AccessKey,
                          secretAccessKey: s3SecretKey,
                        },
                      }
                    : {}),
                },
                bucket: s3Bucket,
                root: directory ? `${directory}/${userPath}` : userPath,
              });
            }
          }

          return adapter;
        } catch (e) {
          throw new Error("Couldn't mount server root.");
        }
      },

      authenticator: async (_request, _response) => {
        if (pamAuth) {
          const { Authenticator: PamAuthenticator } = await import(
            '@nephele/authenticator-pam'
          );
          return new PamAuthenticator({ realm });
        }

        if (auth) {
          if (
            authUsername != null &&
            authUsername.trim() !== '' &&
            authPassword != null
          ) {
            return new CustomAuthenticator({
              realm,

              async getUser(username) {
                return username === authUsername?.trim()
                  ? new CustomUser({ username })
                  : null;
              },

              async authBasic(user, password) {
                return (
                  user.username === authUsername?.trim() &&
                  password === authPassword?.trim()
                );
              },
            });
          }

          return new HtpasswdAuthenticator({
            realm,
            authUserFilename,
            authUserFile,
          });
        }

        return new InsecureAuthenticator();
      },

      plugins: [
        ...(encryption &&
        encryptionSalt &&
        encryptionFilenameSalt &&
        encryptionFilenameIvSalt
          ? [
              new EncryptionPlugin({
                salt: encryptionSalt,
                filenameSalt: encryptionFilenameSalt,
                filenameIVSalt: encryptionFilenameIvSalt,
                filenameEncoding: encryptionFilenameEncoding ?? undefined,
                globalPassword: encryptionGlobalPassword ?? undefined,
                exclude: [
                  ...(encryptionExclude?.split(',') ?? []),
                  // Exclude the .htpasswd file if it's used.
                  ...(!pamAuth &&
                  auth &&
                  !(
                    authUsername != null &&
                    authUsername.trim() !== '' &&
                    authPassword != null
                  ) &&
                  !homeDirectories &&
                  !userDirectories &&
                  !authUserFile
                    ? [`/${authUserFilename ?? '.htpasswd'}`]
                    : []),
                ],
              }),
            ]
          : []),
        ...(serveIndexes || serveListings
          ? [new IndexPlugin({ serveIndexes, serveListings })]
          : []),
      ],
    })
  );

  // Run server.
  let server: Server;
  if (secure) {
    server = https
      .createServer({ cert, key }, app)
      .listen(port, host === '::' ? undefined : host);

    if (redirectPort != null) {
      const redirectApp = express();

      redirectApp.use((req, res) => {
        // Redirect to the secure app.
        return res.redirect(req.protocol + 's://' + req.headers.host + req.url);
      });

      const redirectServer = http
        .createServer({}, redirectApp)
        .listen(redirectPort, host === '::' ? undefined : host);

      redirectServer.on('listening', () => {
        console.log(
          `Nephele redirect server listening on ${serverHosts
            .map(
              ({ name, address }) =>
                `dav://${address}:${redirectPort} (${name})`
            )
            .join(', ')}`
        );
      });

      redirectServer.on('close', () => {
        console.log('Nephele redirect server closed.');
      });
    }
  } else {
    server = http
      .createServer({}, app)
      .listen(port, host === '::' ? undefined : host);
  }

  server.on('listening', () => {
    console.log(
      `Nephele server listening on \n\t${serverHosts
        .map(
          ({ name, address }) =>
            `dav${secure ? 's' : ''}://${address}:${port} (${name})`
        )
        .join('\n\t')}`
    );

    server.requestTimeout = timeout || 0;
    if (keepAliveTimeout != null) {
      server.keepAliveTimeout = keepAliveTimeout;
      server.headersTimeout = Math.max(
        server.headersTimeout,
        server.keepAliveTimeout + 1000
      );
    }
  });

  server.on('close', () => {
    console.log('Nephele server closed.');
  });
} catch (e: any) {
  console.error('Error:', e.message);
  process.exit(1);
}
