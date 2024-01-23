import type { Server } from 'node:http';
import https from 'node:https';
import http from 'node:http';
import { networkInterfaces, hostname } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { program, Option } from 'commander';
import express from 'express';
import nepheleServer from 'nephele';
import FileSystemAdapter from '@nephele/adapter-file-system';
import VirtualAdapter from '@nephele/adapter-virtual';
import CustomAuthenticator, {
  User as CustomUser,
} from '@nephele/authenticator-custom';
import HtpasswdAuthenticator from '@nephele/authenticator-htpasswd';
import InsecureAuthenticator from '@nephele/authenticator-none';
import IndexPlugin from '@nephele/plugin-index';
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
  .option('--no-update-check', "Don't check for updates.")
  .argument(
    '[directory]',
    'The path of the directory to use as the server root.'
  );

program.addHelpText(
  'after',
  `
Environment Variables:
  HOST                 Same as --host.
  PORT                 Same as --port.
  REDIRECT_PORT        Same as --redirect-port.
  TIMEOUT              Same as --timeout.
  KEEPALIVETIMEOUT     Same as --keep-alive-timeout.
  REALM                Same as --realm.
  CERT_FILE            Same as --cert.
  CERT                 Text of a cert in PEM format.
  KEY_FILE             Same as --key.
  KEY                  Text of a key in PEM format.
  HOME_DIRECTORIES     Same as --home-directories when set to "true", "on" or "1".
  USER_DIRECTORIES     Same as --user-directories when set to "true", "on" or "1".
  SERVE_INDEXES        Same as --serve-indexes when set to "true", "on" or "1".
  SERVE_LISTINGS       Same as --serve-listings when set to "true", "on" or "1".
  AUTH                 Same as --no-auth when set to "false", "off" or "0".
  PAM_AUTH             Same as --pam-auth when set to "true", "on" or "1".
  AUTH_USER_FILENAME   Same as --auth-user-filename.
  AUTH_USER_FILE       Same as --auth-user-file.
  AUTH_USERNAME        Same as --auth-username.
  AUTH_PASSWORD        Same as --auth-password.
  UPDATE_CHECK         Same as --no-update-check when set to "false", "off" or "0".
  SERVER_ROOT          Same as [directory].

Options given on the command line take precedence over options from an environment variable.`
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

  if (userDirectories && directory == null) {
    throw new Error('Serving user directories requires a root directory.');
  }

  if (directory == null && !homeDirectories) {
    throw new Error(
      'A root directory or the --home-directories option is required.'
    );
  }

  if ((homeDirectories || userDirectories) && !auth) {
    throw new Error(
      'The --home-directories and --user-directories options require authentication.'
    );
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

  if (directory != null && !fs.statSync(directory).isDirectory()) {
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

            return new FileSystemAdapter({ root });
          }

          return new FileSystemAdapter({ root: directory });
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
        ...(!serveIndexes && !serveListings
          ? []
          : [new IndexPlugin({ serveIndexes, serveListings })]),
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
