import { User, type UserData } from '@nymphjs/tilmeld';

import type { AuthenticatorConfig, AuthResponse } from './Authenticator.js';
import Authenticator from './Authenticator.js';

export type { AuthenticatorConfig, AuthResponse };
export default Authenticator;
export { Authenticator, User, UserData };
