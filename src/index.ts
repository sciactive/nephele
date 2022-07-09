import type {
  Adapter,
  AuthResponse,
  Cache,
  Lock,
  Properties,
  Resource,
  User,
} from './Interfaces/index.js';
import type { Options } from './Options.js';

export * from './Errors/index.js';
import createServer from './createServer.js';
import { defaults } from './Options.js';

export {
  Adapter,
  AuthResponse,
  Cache,
  Lock,
  Properties,
  Resource,
  User,
  Options,
};

export { createServer, defaults };

export default createServer;
