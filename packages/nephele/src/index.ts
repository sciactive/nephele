import type {
  Adapter,
  Authenticator,
  AuthResponse,
  Cache,
  Lock,
  Plugin,
  Properties,
  Resource,
  User,
} from './Interfaces/index.js';
import type { Options, Config } from './Options.js';

export * from './Errors/index.js';
import createServer from './createServer.js';
import { defaults, getAdapter, getAuthenticator } from './Options.js';

export * from './Methods/index.js';

export * from './catchErrors.js';
export * from './HTTPStatusMessages.js';
export * from './MultiStatus.js';

export {
  Adapter,
  Authenticator,
  AuthResponse,
  Cache,
  Config,
  Lock,
  Plugin,
  Properties,
  Resource,
  User,
  Options,
  getAdapter,
  getAuthenticator,
};

export { createServer, defaults };

export default createServer;
