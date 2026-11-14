import type { EntityConstructor } from '@nymphjs/nymph';
import { Entity, TilmeldAccessLevels, nymphValibotProps } from '@nymphjs/nymph';
import { enforceTilmeld, tilmeldValibotProps } from '@nymphjs/tilmeld';
import * as v from 'valibot';
import { BadRequestError, UnauthorizedError } from 'nephele';

import { Resource } from './Resource.js';

const LockSchema = v.strictObject({
  ...nymphValibotProps,
  ...tilmeldValibotProps,

  token: v.pipe(v.string(), v.nonEmpty()),
  date: v.number(),
  timeout: v.number(),
  scope: v.picklist(['exclusive', 'shared']),
  depth: v.picklist(['0', 'infinity']),
  provisional: v.boolean(),
  owner: v.any(),
  username: v.pipe(v.string(), v.nonEmpty()),
  resource: v.lazy(() => v.instance(Resource)),
});

type LockData = Omit<
  v.InferInput<typeof LockSchema>,
  keyof typeof nymphValibotProps
>;

export interface Lock extends LockData {}

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

  constructor() {
    super();

    this.token = '';
    this.date = new Date().getTime();
    this.timeout = 1000 * 60 * 60 * 24 * 2; // Default to two day timeout.
    this.scope = 'exclusive';
    this.depth = '0';
    this.provisional = false;
    this.owner = {};
    this.username = '';
    this.resource = Resource.factorySync();
  }

  public async $validate() {
    try {
      v.parse(LockSchema, this.$getValidatable());
    } catch (e: any) {
      throw new BadRequestError(
        `Invalid ${(this.constructor as EntityConstructor).class}: ` +
          (e instanceof v.ValiError
            ? Object.entries(v.flatten(e.issues).nested || {})
                .map(([field, messages]) => `"${field}": ${messages}`)
                .join(', ')
            : e?.message),
      );
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

    if (JSON.stringify(this.owner).length > 8192) {
      throw new BadRequestError('Lock owner must be less than 8KB.');
    }

    this.acUser = TilmeldAccessLevels.FULL_ACCESS;
    this.acGroup = TilmeldAccessLevels.READ_ACCESS;
    this.acOther = TilmeldAccessLevels.READ_ACCESS;

    // Validate the entity's data.
    await this.$validate();

    return await super.$save();
  }

  /*
   * This should *never* be accessible on the client.
   */
  async $saveSkipAC() {
    this.$skipAcWhenSaving = true;
    return await this.$save();
  }

  $tilmeldSaveSkipAC() {
    if (this.$skipAcWhenSaving) {
      this.$skipAcWhenSaving = false;
      return true;
    }
    return false;
  }

  /*
   * This should *never* be accessible on the client.
   */
  async $deleteSkipAC() {
    this.$skipAcWhenDeleting = true;
    return await this.$delete();
  }

  $tilmeldDeleteSkipAC() {
    if (this.$skipAcWhenDeleting) {
      this.$skipAcWhenDeleting = false;
      return true;
    }
    return false;
  }
}
