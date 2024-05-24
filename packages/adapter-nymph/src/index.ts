import type { AdapterConfig } from './Adapter.js';
import Adapter from './Adapter.js';
import Lock from './Lock.js';
import Properties from './Properties.js';
import Resource from './Resource.js';

import { Lock as NymphLock } from './entities/Lock.js';
import { Resource as NymphResource } from './entities/Resource.js';

export type { AdapterConfig };
export default Adapter;
export { Adapter, Lock, Properties, Resource, NymphLock, NymphResource };
