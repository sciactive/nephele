import type { Nymph } from '@nymphjs/nymph';
import { Entity, TilmeldAccessLevels, nymphJoiProps } from '@nymphjs/nymph';
import type { AccessControlData } from '@nymphjs/tilmeld';
import { enforceTilmeld, tilmeldJoiProps } from '@nymphjs/tilmeld';
import Joi from 'joi';
import { BadRequestError, UnauthorizedError } from 'nephele';

import { Resource, type ResourceData } from './Resource.js';

export type LockData = {
  token: string;
  date: number;
  timeout: number;
  scope: 'exclusive' | 'shared';
  depth: '0' | 'infinity';
  provisional: boolean;
  owner: any;
  username: string;
  resource: Resource & ResourceData;
} & AccessControlData;

export class Lock extends Entity<LockData> {
  static ETYPE = 'nephele_lock';
  static class = 'Lock';

  public static clientEnabledStaticMethods = [];
  protected $clientEnabledMethods = [];
  protected $allowlistData = [];
  protected $allowlistTags = [];
  protected $privateData = [];

  private $skipAcWhenSaving = false;

  private $skipAcWhenDeleting = false;

  static async factory(guid?: string): Promise<Lock & LockData> {
    return (await super.factory(guid)) as Lock & LockData;
  }

  static factorySync(): Lock & LockData {
    return super.factorySync() as Lock & LockData;
  }

  constructor() {
    super();

    this.$data.token = '';
    this.$data.date = new Date().getTime();
    this.$data.timeout = 1000 * 60 * 60 * 24 * 2; // Default to two day timeout.
    this.$data.scope = 'exclusive';
    this.$data.depth = '0';
    this.$data.provisional = false;
    this.$data.owner = {};
    this.$data.username = '';
    this.$data.resource = Resource.factorySync();
  }

  public $setNymph(nymph: Nymph) {
    this.$nymph = nymph;
    if (!this.$asleep()) {
      if (this.$data.user) {
        this.$data.user.$nymph = nymph;
      }
      if (this.$data.group) {
        this.$data.group.$nymph = nymph;
      }
      if (this.$data.resource) {
        this.$data.resource.$setNymph(nymph);
      }
    }
  }

  async $save() {
    try {
      const tilmeld = enforceTilmeld(this);
      if (!tilmeld.gatekeeper()) {
        throw new UnauthorizedError('You must be logged in.');
      }
    } catch (e: any) {
      // No Tilmeld means auth happened elsewhere.
    }

    if (JSON.stringify(this.$data.owner).length > 8192) {
      throw new BadRequestError('Lock owner must be less than 8KB.');
    }

    this.$data.acUser = TilmeldAccessLevels.FULL_ACCESS;
    this.$data.acGroup = TilmeldAccessLevels.READ_ACCESS;
    this.$data.acOther = TilmeldAccessLevels.READ_ACCESS;

    // Validate the entity's data.
    try {
      Joi.attempt(
        this.$getValidatable(),
        Joi.object().keys({
          ...nymphJoiProps,
          ...tilmeldJoiProps,

          token: Joi.string().required(),
          date: Joi.number().required(),
          timeout: Joi.number().required(),
          scope: Joi.string().allow('exclusive', 'shared').required(),
          depth: Joi.string().allow('0', 'infinity').required(),
          provisional: Joi.boolean().required(),
          owner: Joi.any().required(),
          username: Joi.string().required(),
          resource: Joi.object().instance(Resource).required(),
        }),
        'Invalid Lock: ',
      );
    } catch (e: any) {
      throw new BadRequestError(e.message);
    }

    return await super.$save();
  }

  /*
   * This should *never* be accessible on the client.
   */
  public async $saveSkipAC() {
    this.$skipAcWhenSaving = true;
    return await this.$save();
  }

  public $tilmeldSaveSkipAC() {
    if (this.$skipAcWhenSaving) {
      this.$skipAcWhenSaving = false;
      return true;
    }
    return false;
  }

  /*
   * This should *never* be accessible on the client.
   */
  public async $deleteSkipAC() {
    this.$skipAcWhenDeleting = true;
    return await this.$delete();
  }

  public $tilmeldDeleteSkipAC() {
    if (this.$skipAcWhenDeleting) {
      this.$skipAcWhenDeleting = false;
      return true;
    }
    return false;
  }
}
