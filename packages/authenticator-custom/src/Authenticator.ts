import crypto from 'node:crypto';
import type { Request } from 'express';
import {
  parseAuthorizationHeader,
  BASIC,
  DIGEST,
} from 'http-auth-utils-hperrin';
import { v4 as uuid } from 'uuid';
import type {
  Authenticator as AuthenticatorInterface,
  AuthResponse as NepheleAuthResponse,
} from 'nephele';
import { UnauthorizedError } from 'nephele';

import User from './User.js';

export type AuthenticatorConfig = {
  /**
   * A function that takes a username and returns a promise that resolves to a
   * user if the user exists or it's not possible to tell whether they exist, or
   * null otherwise.
   */
  getUser: (username: string) => Promise<User | null>;
  /**
   * The realm is the name reported by the server when the user is prompted to
   * authenticate.
   *
   * It should be HTTP header safe (shouldn't include double quotes or
   * semicolon).
   */
  realm?: string;
  /**
   * A private key used to calculate nonce values for Digest authentication.
   *
   * If you do not provide one, one will be generated, but this does mean that
   * with Digest authentication, clients will only be able to authenticate to
   * _that_ particular server. If you have multiple servers or multiple
   * instances of Nephele that serve the same source data, you should provide
   * the same key to all of them in order to use Digest authentication
   * correctly.
   */
  key?: string;
  /**
   * The number of milliseconds for which a nonce is valid once issued. Defaults
   * to 6 hours.
   */
  nonceTimeout?: number;
} & (
  | {
      /**
       * Authorize a User returned by `getUser` with a password.
       *
       * The returned promise should resolve to true if the user is successfully
       * authenticated, false otherwise.
       *
       * The Basic mechanism requires the user to submit their username and
       * password in plain text with the request, so only use this if the
       * connection is secured through some means like TLS. If you provide
       * `authBasic`, the server will advertise support for the Basic mechanism.
       */
      authBasic: (user: User, password: string) => Promise<boolean>;
    }
  | {
      /**
       * Retrieve a User's password or hash for Digest authentication.
       *
       * The returned promise should resolve to the password or hash if the user
       * exists, or null otherwise. If the password is returned, it will be
       * hashed, however, you can also return a prehashed string of
       * SHA256(username:realm:password) or MD5(username:realm:password),
       * depending on the requested algorithm.
       *
       * The Digest mechansism requires the user to cryptographically hash their
       * password with the request, so it will not divulge their password to
       * eaves droppers. However, it is still less safe than using TLS and Basic
       * authentication. If you provide `authDigest`, the server will advertise
       * support for the Digest mechanism.
       */
      authDigest: (
        user: User,
        realm: string,
        algorithm: 'sha256' | 'md5'
      ) => Promise<{ password: string } | { hash: string } | null>;
    }
);

export type AuthResponse = NepheleAuthResponse<any, { user: User }>;

class StaleUnauthorizedError extends UnauthorizedError {}

function hash(input: string, algorithm: 'md5' | 'sha256') {
  return crypto.createHash(algorithm).update(input).digest('hex').toLowerCase();
}

/**
 * Nephele custom authenticator.
 */
export default class Authenticator implements AuthenticatorInterface {
  getUser: (username: string) => Promise<User | null>;
  authBasic?: (user: User, password: string) => Promise<boolean>;
  authDigest?: (
    user: User,
    realm: string,
    algorithm: 'sha256' | 'md5'
  ) => Promise<{ password: string } | { hash: string } | null>;
  realm: string;
  key: string;
  nonceTimeout: number;

  constructor(config: AuthenticatorConfig) {
    this.getUser = config.getUser;
    if ('authBasic' in config) {
      this.authBasic = config.authBasic;
    }
    if ('authDigest' in config) {
      this.authDigest = config.authDigest;
    }

    if (this.authBasic == null && this.authDigest == null) {
      throw new Error(
        'You must provide at least one auth function to authenticator-custom.'
      );
    }

    this.realm = config.realm || 'Nephele WebDAV Service';
    this.key = config.key || uuid();
    // Nonce is valid for 6 hours by default.
    this.nonceTimeout = config.nonceTimeout || 1000 * 60 * 60 * 6;
  }

  async authenticate(request: Request, response: AuthResponse) {
    const authorization = request.get('Authorization');

    try {
      if (authorization) {
        const auth = parseAuthorizationHeader(authorization);

        if (auth.type === 'Basic' && 'password' in auth.data) {
          let { username, password } = auth.data;

          if (this.authBasic == null || (!username && !password)) {
            throw new UnauthorizedError(
              'You must authenticate to access this server.'
            );
          }

          const user = await this.getUser(username);

          if (user == null) {
            throw new UnauthorizedError(
              'The provided credentials are not correct.'
            );
          }

          if (!(await this.authBasic(user, password))) {
            throw new UnauthorizedError(
              'The provided credentials are not correct.'
            );
          }

          return user;
        } else if (auth.type === 'Digest' && 'response' in auth.data) {
          let {
            username,
            realm,
            nonce,
            uri,
            algorithm,
            response,
            cnonce,
            nc,
            qop,
            opaque,
          } = auth.data;

          if (
            this.authDigest == null ||
            !username ||
            opaque == null ||
            realm !== this.realm ||
            (uri !== request.url &&
              uri !==
                `${request.protocol}://${request.headers.host}${request.url}`)
          ) {
            throw new UnauthorizedError(
              'You must authenticate to access this server.'
            );
          }

          const timestamp = parseInt(opaque, 16);

          if (
            isNaN(timestamp) ||
            timestamp < new Date().getTime() - this.nonceTimeout
          ) {
            throw new StaleUnauthorizedError('The provided nonce has expired.');
          }

          const checkNonce = hash(
            `${request.ip}:${opaque}:${this.key}`,
            'sha256'
          );

          if (checkNonce !== nonce) {
            throw new StaleUnauthorizedError(
              'The provided nonce was not issued to this client by this server.'
            );
          }

          const user = await this.getUser(username);

          if (user == null) {
            throw new UnauthorizedError(
              'The provided credentials are not correct.'
            );
          }

          if (
            (algorithm != null &&
              algorithm !== 'SHA256-sess' &&
              algorithm !== 'MD5-sess') ||
            cnonce == null ||
            qop === 'auth-int'
          ) {
            throw new UnauthorizedError(
              'The provided credentials are not in a supported format.'
            );
          }

          const digestInfo = await this.authDigest(
            user,
            this.realm,
            algorithm === 'MD5-sess' ? 'md5' : 'sha256'
          );
          if (digestInfo == null) {
            throw new UnauthorizedError(
              'The provided credentials are not correct.'
            );
          }

          const hashAlg = algorithm === 'MD5-sess' ? 'md5' : 'sha256';
          let HA1: string;

          if ('hash' in digestInfo) {
            HA1 = hash(`${digestInfo.hash}:${nonce}:${cnonce}`, hashAlg);
          } else {
            const { password } = digestInfo;
            HA1 = hash(
              `${hash(
                `${username}:${this.realm}:${password}`,
                hashAlg
              )}:${nonce}:${cnonce}`,
              hashAlg
            );
          }

          let HA2 = hash(`${request.method}:${uri}`, hashAlg);

          let check: string;
          if (qop === 'auth') {
            check = hash(
              `${HA1}:${nonce}:${nc}:${cnonce}:${qop}:${HA2}`,
              hashAlg
            );
          } else {
            check = hash(`${HA1}:${nonce}:${HA2}`, hashAlg);
          }

          if (check !== response) {
            throw new UnauthorizedError(
              'The provided credentials are not correct.'
            );
          }

          return user;
        }
      }

      throw new UnauthorizedError(
        'You must authenticate to access this server.'
      );
    } catch (e: any) {
      if (e instanceof UnauthorizedError) {
        const auths: string[] = [];
        if (this.authBasic != null) {
          auths.push(
            `Basic ${BASIC.buildWWWAuthenticateRest({
              realm: this.realm,
            })}, charset="UTF-8"`
          );
        }
        if (this.authDigest != null) {
          const opaque = new Date().getTime().toString(16);
          const nonce = hash(`${request.ip}:${opaque}:${this.key}`, 'sha256');
          auths.push(
            `Digest ${DIGEST.buildWWWAuthenticateRest({
              nonce,
              opaque,
              qop: 'auth',
              algorithm: 'SHA256-sess' as 'MD5-sess',
              realm: this.realm,
              stale: e instanceof StaleUnauthorizedError ? 'true' : 'false',
            })}, charset="UTF-8"`
          );
          auths.push(
            `Digest ${DIGEST.buildWWWAuthenticateRest({
              nonce,
              opaque,
              qop: 'auth',
              algorithm: 'MD5-sess',
              realm: this.realm,
              stale: e instanceof StaleUnauthorizedError ? 'true' : 'false',
            })}, charset="UTF-8"`
          );
        }
        response.set('WWW-Authenticate', auths);
      }
      throw e;
    }
  }

  async cleanAuthentication(_request: Request, _response: AuthResponse) {
    // Nothing is required for auth cleanup.
    return;
  }
}
