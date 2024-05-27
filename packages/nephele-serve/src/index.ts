import type { Server } from 'node:http';
import https from 'node:https';
import http from 'node:http';
import { networkInterfaces, hostname } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { program, Option } from 'commander';
import express from 'express';
import { Nymph, type NymphDriver } from '@nymphjs/nymph';
import { SQLite3Driver } from '@nymphjs/driver-sqlite3';
import { MySQLDriver } from '@nymphjs/driver-mysql';
import { PostgreSQLDriver } from '@nymphjs/driver-postgresql';
import {
  enforceTilmeld,
  User as NymphUser,
  UserData as NymphUserData,
  Group as NymphGroup,
  Tilmeld,
} from '@nymphjs/tilmeld';
import { createServer as nymphServer } from '@nymphjs/server';
import { setup as nymphSetup } from '@nymphjs/tilmeld-setup';
import type { Adapter } from 'nephele';
import nepheleServer, { ResourceNotFoundError } from 'nephele';
import FileSystemAdapter from '@nephele/adapter-file-system';
import NymphAdapter from '@nephele/adapter-nymph';
import S3Adapter from '@nephele/adapter-s3';
import VirtualAdapter from '@nephele/adapter-virtual';
import CustomAuthenticator, {
  User as CustomUser,
} from '@nephele/authenticator-custom';
import HtpasswdAuthenticator from '@nephele/authenticator-htpasswd';
import NymphAuthenticator from '@nephele/authenticator-nymph';
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
  nymph: boolean;
  nymphJwtSecret?: string;
  nymphRestPath?: string;
  nymphSetupPath?: string;
  nymphRegistration: boolean;
  nymphExport?: string;
  nymphImport?: string;
  nymphDbDriver?: string;
  nymphMysqlHost?: string;
  nymphMysqlPort?: number;
  nymphMysqlDatabase?: string;
  nymphMysqlUsername?: string;
  nymphMysqlPassword?: string;
  nymphMysqlPrefix?: string;
  nymphPostgresHost?: string;
  nymphPostgresPort?: number;
  nymphPostgresDatabase?: string;
  nymphPostgresUsername?: string;
  nymphPostgresPassword?: string;
  nymphPostgresPrefix?: string;
  nymphSqliteCacheSize?: number;
  nymphSqlitePrefix?: string;
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
  .option(
    '--nymph',
    'Use Nymph adapter for a deduplicated file system. (Not compatible with home/user directories, .htpasswd auth, S3, or encryption.)'
  )
  .option(
    '--nymph-jwt-secret <jwt-secret>',
    'A random string to use as the JWT secret for the Nymph user setup app.'
  )
  .option(
    '--nymph-rest-path <rest-path>',
    'The path to use for the Nymph rest server used by the user setup app. (Defaults to "/!nymph".)'
  )
  .option(
    '--nymph-setup-path <setup-path>',
    'The path to use for the Nymph user setup app. (Defaults to "/!users".)'
  )
  .option(
    '--no-nymph-registration',
    "Don't allow new user registration through the Nymph user setup app."
  )
  .option(
    '--nymph-export <filename>',
    'Export the Nymph database to a NEX file.'
  )
  .option(
    '--nymph-import <filename>',
    'Import the Nymph database from a NEX file.'
  )
  .option(
    '--nymph-db-driver <db_driver>',
    'The type of the DB driver to use. (Can be "mysql", "postgres", or "sqlite". Defaults to "sqlite").'
  )
  .option(
    '--nymph-mysql-host <host>',
    'The MySQL host if the DB driver is "mysql". (Defaults to "localhost".)'
  )
  .addOption(
    new Option(
      '--nymph-mysql-port <port>',
      'The MySQL port if the DB driver is "mysql". (Defaults to 3306.)'
    ).argParser(parseInt)
  )
  .option(
    '--nymph-mysql-database <database>',
    'The MySQL database if the DB driver is "mysql". (Defaults to "nymph".)'
  )
  .option(
    '--nymph-mysql-username <username>',
    'The MySQL username if the DB driver is "mysql". (Defaults to "nymph".)'
  )
  .option(
    '--nymph-mysql-password <password>',
    'The MySQL password if the DB driver is "mysql". (Defaults to "password".)'
  )
  .option(
    '--nymph-mysql-prefix <prefix>',
    'The MySQL table prefix if the DB driver is "mysql". (Defaults to "nymph_".)'
  )
  .option(
    '--nymph-postgres-host <host>',
    'The PostgreSQL host if the DB driver is "postgres". (Defaults to "localhost".)'
  )
  .addOption(
    new Option(
      '--nymph-postgres-port <port>',
      'The PostgreSQL port if the DB driver is "postgres". (Defaults to 5432.)'
    ).argParser(parseInt)
  )
  .option(
    '--nymph-postgres-database <database>',
    'The PostgreSQL database if the DB driver is "postgres". (Defaults to "nymph".)'
  )
  .option(
    '--nymph-postgres-username <username>',
    'The PostgreSQL username if the DB driver is "postgres". (Defaults to "nymph".)'
  )
  .option(
    '--nymph-postgres-password <password>',
    'The PostgreSQL password if the DB driver is "postgres". (Defaults to "password".)'
  )
  .option(
    '--nymph-postgres-prefix <prefix>',
    'The PostgreSQL table prefix if the DB driver is "postgres". (Defaults to "nymph_".)'
  )
  .option(
    '--nymph-sqlite-cache-size <kilobytes>',
    'The SQLite cache size to maintain in memory. (Defaults to 100MB).'
  )
  .option(
    '--nymph-sqlite-prefix <prefix>',
    'The SQLite table prefix if the DB driver is "sqlite". (Defaults to "nymph_".)'
  )
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
  NYMPH                                      Same as --nymph when set to "true", "on" or "1".
  NYMPH_JWT_SECRET                           Same as --nymph-jwt-secret.
  NYMPH_REST_PATH                            Same as --nymph-rest-path.
  NYMPH_SETUP_PATH                           Same as --nymph-setup-path.
  NYMPH_REGISTRATION                         Same as --no-nymph-registration when set to "false", "off" or "0".
  NYMPH_EXPORT                               Same as --nymph-export.
  NYMPH_IMPORT                               Same as --nymph-import.
  NYMPH_DB_DRIVER                            Same as --nymph-db-driver.
  NYMPH_MYSQL_HOST                           Same as --nymph-mysql-host.
  NYMPH_MYSQL_PORT                           Same as --nymph-mysql-port.
  NYMPH_MYSQL_DATABASE                       Same as --nymph-mysql-database.
  NYMPH_MYSQL_USERNAME                       Same as --nymph-mysql-username.
  NYMPH_MYSQL_PASSWORD                       Same as --nymph-mysql-password.
  NYMPH_MYSQL_PREFIX                         Same as --nymph-mysql-prefix.
  NYMPH_POSTGRES_HOST                        Same as --nymph-postgres-host.
  NYMPH_POSTGRES_PORT                        Same as --nymph-postgres-port.
  NYMPH_POSTGRES_DATABASE                    Same as --nymph-postgres-database.
  NYMPH_POSTGRES_USERNAME                    Same as --nymph-postgres-username.
  NYMPH_POSTGRES_PASSWORD                    Same as --nymph-postgres-password.
  NYMPH_POSTGRES_PREFIX                      Same as --nymph-postgres-prefix.
  NYMPH_SQLITE_CACHE_SIZE                    Same as --nymph-sqlite-cache-size.
  NYMPH_SQLITE_PREFIX                        Same as --nymph-sqlite-prefix.
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
  'after',
  `
Nymph and File Deduplication:
  When Nephele is loaded with the Nymph adapter, it will use a deduplicating
  file storage method. File metadata is stored in the Nymph database, which can
  be a SQLite3, MySQL, or PostgreSQL database, and file contents are stored on
  disk using their SHA-384 hash for deduplication.

  When using the Nymph adapter, unless auth is disable, PAM auth is enabled, or
  a global username/password is set, the Nymph authenticator will be loaded.
  This authenticator uses Tilmeld, which is a user/group manager for Nymph. The
  first user you create will be the admin user, then you should turn off
  registration.

  The SQLite3 driver is easier to set up, because the DB can be stored in a file
  alongside the file blobs, but it is considerably slower if you have many files
  in your server. It also must be on a local disk, because it uses SQLite's
  write ahead log.

  The MySQL and PostgreSQL drivers are much faster. If you start with a SQLite
  DB and end up outgrowing it, you can export your Nymph DB to a NEX file, then
  import it into a new database. The import can take a long time (many hours),
  so plan for downtime if you do this.

  Because the files are deduplicated, this can be a great option if you store
  something like regular backups, where many files have the same contents.

  You can find more information about Nephele's Nymph.js adapter here:
  https://github.com/sciactive/nephele/blob/master/packages/adapter-nymph/README.md

  You can find more information about Nephele's Nymph.js authenticator here:
  https://github.com/sciactive/nephele/blob/master/packages/authenticator-nymph/README.md

  You can find more information about Nymph.js:
  https://nymph.io`
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
    nymph,
    nymphJwtSecret,
    nymphRestPath,
    nymphSetupPath,
    nymphRegistration,
    nymphExport,
    nymphImport,
    nymphDbDriver,
    nymphMysqlHost,
    nymphMysqlPort,
    nymphMysqlDatabase,
    nymphMysqlUsername,
    nymphMysqlPassword,
    nymphMysqlPrefix,
    nymphPostgresHost,
    nymphPostgresPort,
    nymphPostgresDatabase,
    nymphPostgresUsername,
    nymphPostgresPassword,
    nymphPostgresPrefix,
    nymphSqliteCacheSize,
    nymphSqlitePrefix,
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
    nymph: ['true', 'on', '1'].includes(
      (process.env.NYMPH || '').toLowerCase()
    ),
    nymphJwtSecret: process.env.NYMPH_JWT_SECRET,
    nymphRestPath: process.env.NYMPH_REST_PATH,
    nymphSetupPath: process.env.NYMPH_SETUP_PATH,
    nymphRegistration: !['false', 'off', '0'].includes(
      (process.env.NYMPH_REGISTRATION || '').toLowerCase()
    ),
    nymphExport: process.env.NYMPH_EXPORT,
    nymphImport: process.env.NYMPH_IMPORT,
    nymphDbDriver: process.env.NYMPH_DB_DRIVER,
    nymphMysqlHost: process.env.NYMPH_MYSQL_HOST,
    nymphMysqlPort: process.env.NYMPH_MYSQL_PORT,
    nymphMysqlDatabase: process.env.NYMPH_MYSQL_DATABASE,
    nymphMysqlUsername: process.env.NYMPH_MYSQL_USERNAME,
    nymphMysqlPassword: process.env.NYMPH_MYSQL_PASSWORD,
    nymphMysqlPrefix: process.env.NYMPH_MYSQL_PREFIX,
    nymphPostgresHost: process.env.NYMPH_POSTGRES_HOST,
    nymphPostgresPort: process.env.NYMPH_POSTGRES_PORT,
    nymphPostgresDatabase: process.env.NYMPH_POSTGRES_DATABASE,
    nymphPostgresUsername: process.env.NYMPH_POSTGRES_USERNAME,
    nymphPostgresPassword: process.env.NYMPH_POSTGRES_PASSWORD,
    nymphPostgresPrefix: process.env.NYMPH_POSTGRES_PREFIX,
    nymphSqliteCacheSize: process.env.NYMPH_SQLITE_CACHE_SIZE,
    nymphSqlitePrefix: process.env.NYMPH_SQLITE_PREFIX,
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

  if (
    directory == null &&
    !homeDirectories &&
    s3Endpoint == null &&
    nymphExport == null &&
    nymphImport == null
  ) {
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

  if (nymph && homeDirectories) {
    throw new Error(
      'The --nymph option is not compatible with --home-directories.'
    );
  }

  if (nymph && userDirectories) {
    throw new Error(
      'The --nymph option is not compatible with --user-directories.'
    );
  }

  let tilmeld: Tilmeld | undefined = undefined;
  if (
    nymph &&
    auth &&
    !pamAuth &&
    (authUsername == null || authPassword == null)
  ) {
    if (nymphJwtSecret == null) {
      throw new Error(
        'The --nymph option with auth enabled, PAM auth disabled, and no global username/password, requires a JWT secret to be set with --nymph-jwt-secret.'
      );
    }

    tilmeld = new Tilmeld({
      jwtSecret: nymphJwtSecret,
      setupPath: nymphSetupPath ?? '/!users',
      appName: realm,
      allowRegistration: nymphRegistration,
      emailUsernames: false,
      userFields: [],
      regFields: [],
      verifyEmail: false,
      pwRecovery: false,
    });
  }

  if (nymph && encryption) {
    throw new Error('The --nymph option is not compatible with --encryption.');
  }

  if (nymph && s3Endpoint != null) {
    throw new Error('The --nymph option is not compatible with S3.');
  }

  if (nymph && directory == null) {
    throw new Error('The --nymph option requires a root directory.');
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

  let nymphInstance: Nymph | undefined = undefined;
  let nymphDriver: NymphDriver | undefined = undefined;
  if (nymph) {
    if (nymphDbDriver === 'mysql') {
      nymphDriver = new MySQLDriver({
        ...(nymphMysqlHost != null ? { host: nymphMysqlHost } : {}),
        ...(nymphMysqlPort != null ? { port: nymphMysqlPort } : {}),
        ...(nymphMysqlDatabase != null ? { database: nymphMysqlDatabase } : {}),
        ...(nymphMysqlUsername != null ? { user: nymphMysqlUsername } : {}),
        ...(nymphMysqlPassword != null ? { password: nymphMysqlPassword } : {}),
        ...(nymphMysqlPrefix != null ? { prefix: nymphMysqlPrefix } : {}),
      });
    } else if (nymphDbDriver === 'postgres') {
      nymphDriver = new PostgreSQLDriver({
        ...(nymphPostgresHost != null ? { host: nymphPostgresHost } : {}),
        ...(nymphPostgresPort != null ? { port: nymphPostgresPort } : {}),
        ...(nymphPostgresUsername != null
          ? { user: nymphPostgresUsername }
          : {}),
        ...(nymphPostgresPassword != null
          ? { password: nymphPostgresPassword }
          : {}),
        ...(nymphPostgresDatabase != null
          ? { database: nymphPostgresDatabase }
          : {}),
        ...(nymphPostgresPrefix != null ? { prefix: nymphPostgresPrefix } : {}),
      });
    } else if (directory) {
      nymphDriver = new SQLite3Driver({
        filename: path.resolve(directory, 'nephele.db'),
        wal: true,
        pragmas: [
          `cache_size = -${nymphSqliteCacheSize ?? '100000'};`,
          'synchronous = NORMAL;',
        ],
        ...(nymphSqlitePrefix != null ? { prefix: nymphSqlitePrefix } : {}),
      });
    } else {
      throw new Error('Nymph database misconfigured.');
    }

    nymphInstance = new Nymph(
      {
        cache: true,
        cacheThreshold: 1,
      },
      nymphDriver,
      tilmeld
    );

    if (nymphExport) {
      console.log('Nymph DB export started...');
      if (await nymphInstance.export(nymphExport)) {
        console.log('Nymph DB export finished.');
        process.exit(0);
      } else {
        console.error('Nymph DB export error.');
        process.exit(1);
      }
    }

    if (nymphImport) {
      console.log('Nymph DB import started...');
      if (await nymphInstance.import(nymphImport)) {
        console.log('Nymph DB import finished.');
        process.exit(0);
      } else {
        console.error('Nymph DB import error.');
        process.exit(1);
      }
    }

    if (directory == null) {
      throw new Error('Directory is required when using Nymph adapter.');
    }
  }

  if (nymphInstance && tilmeld) {
    nymphInstance.addEntityClass(NymphUser);
    nymphInstance.addEntityClass(NymphGroup);

    app.use(nymphRestPath ?? '/!nymph', nymphServer(nymphInstance));
    app.use(
      nymphSetupPath ?? '/!users',
      nymphSetup(
        {
          restUrl: nymphRestPath ?? '/!nymph',
        },
        nymphInstance,
        { allowRegistration: nymphRegistration }
      )
    );
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

          if (nymph) {
            if (directory == null || !fs.statSync(directory).isDirectory()) {
              throw new Error('Server root is not an accessible directory.');
            }

            if (nymphInstance == null) {
              throw new Error('Nymph instance is not defined.');
            }

            if (
              tilmeld &&
              response.locals.user &&
              response.locals.user instanceof NymphUser &&
              response.locals.user.guid != null
            ) {
              const authNymph = nymphInstance.clone();
              const authTilmeld = enforceTilmeld(authNymph);
              const user = await authTilmeld.User.factory();
              user.guid = response.locals.user.guid;
              user.cdate = response.locals.user.cdate;
              user.mdate = response.locals.user.mdate;
              user.tags = response.locals.user.tags;
              user.$putData(
                response.locals.user.$getData(false),
                response.locals.user.$getSData()
              );
              await authTilmeld.fillSession(user);
              response.locals.user = user as NymphUser &
                NymphUserData & { username: string };
              adapter = new NymphAdapter({
                root: directory,
                nymph: authNymph,
              });
            } else {
              adapter = new NymphAdapter({
                root: directory,
                nymph: nymphInstance,
              });
            }
          } else if (s3Endpoint == null) {
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
        } catch (e: any) {
          throw new Error(`Couldn't mount server root: ${e.message}`);
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

          if (nymph && tilmeld) {
            if (nymphInstance == null) {
              throw new Error('Nymph instance is not defined.');
            }

            return new NymphAuthenticator({ realm, nymph: nymphInstance });
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

    if (tilmeld) {
      console.log(
        `User setup app available at \n\t${serverHosts
          .map(
            ({ address }) =>
              `http${secure ? 's' : ''}://${address}:${port}${
                nymphSetupPath ?? '/!users'
              }`
          )
          .join('\n\t')}`
      );
    }

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
