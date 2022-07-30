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

export * from './Methods/index.js';

export * from './catchErrors.js';
export * from './HTTPStatusMessages.js';
export * from './MultiStatus.js';

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
