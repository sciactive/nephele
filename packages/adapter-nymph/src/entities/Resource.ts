import type { Nymph, Selector } from '@nymphjs/nymph';
import { Entity, nymphJoiProps } from '@nymphjs/nymph';
import type { AccessControlData } from '@nymphjs/tilmeld';
import { enforceTilmeld, tilmeldJoiProps } from '@nymphjs/tilmeld';
import Joi from 'joi';
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  ResourceExistsError,
  UnauthorizedError,
} from 'nephele';

import { Lock as NymphLock } from './Lock.js';

export type ResourceData = {
  name: string;
  size: number;
  contentType: string;
  collection: boolean;
  hash: string;
  properties: { [k: string]: string };
  parent?: Resource & ResourceData;
} & AccessControlData;

export class Resource extends Entity<ResourceData> {
  static ETYPE = 'nephele_resource';
  static class = 'Resource';

  public static clientEnabledStaticMethods = [];
  protected $clientEnabledMethods = [];
  protected $allowlistData = [];
  protected $allowlistTags = [];
  protected $privateData = [];

  private $skipAcWhenSaving = false;

  private $skipAcWhenDeleting = false;

  static async factory(guid?: string): Promise<Resource & ResourceData> {
    return (await super.factory(guid)) as Resource & ResourceData;
  }

  static factorySync(): Resource & ResourceData {
    return super.factorySync() as Resource & ResourceData;
  }

  constructor() {
    super();

    this.$data.name = '';
    this.$data.size = 0;
    this.$data.contentType = '';
    this.$data.collection = false;
    this.$data.hash = '';
    this.$data.properties = {};
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
      if (this.$data.parent) {
        this.$data.parent.$setNymph(nymph);
      }
    }
  }

  async $copy(
    destinationParent: Resource & ResourceData,
    name: string,
    existingResource?: Resource & ResourceData,
  ) {
    const transaction = 'resource-copy-' + this.guid;
    const nymph = this.$nymph;
    const tnymph = await nymph.startTransaction(transaction);
    this.$setNymph(tnymph);

    try {
      if (existingResource) {
        existingResource.$setNymph(tnymph);

        if (
          await this.$nymph.getEntity(
            { class: this.$nymph.getEntityClass(Resource), skipAc: true },
            {
              type: '&',
              ref: ['parent', existingResource],
            },
          )
        ) {
          throw new ForbiddenError('The destination resource is not empty.');
        }

        if (!(await existingResource.$delete())) {
          throw new InternalServerError(
            "Couldn't delete destination resource.",
          );
        }
      }

      const newNymphResource = await this.$nymph
        .getEntityClass(Resource)
        .factory();
      newNymphResource.name = name;
      newNymphResource.size = this.$data.size;
      newNymphResource.contentType = this.$data.contentType;
      newNymphResource.collection = this.$data.collection;
      newNymphResource.hash = this.$data.hash;
      newNymphResource.properties = JSON.parse(
        JSON.stringify(this.$data.properties),
      );
      newNymphResource.parent = destinationParent;

      if (!(await newNymphResource.$save())) {
        throw new InternalServerError("Couldn't save destination resource.");
      }

      await tnymph.commit(transaction);
      this.$setNymph(nymph);
      if (existingResource) {
        existingResource.$setNymph(nymph);
      }
    } catch (e: any) {
      await tnymph.rollback(transaction);
      this.$setNymph(nymph);
      if (existingResource) {
        existingResource.$setNymph(nymph);
      }
      try {
        // Refresh the entity, since there might be referenced entities that
        // think they're deleted, but aren't really because of the rollback.
        if (existingResource) {
          existingResource.$refresh();
        }
      } catch (e: any) {
        // Ignore this error.
      }
      throw e;
    }
  }

  async $move(
    destinationParent: Resource & ResourceData,
    name: string,
    existingResource?: Resource & ResourceData,
  ) {
    if (
      await this.$nymph.getEntity(
        { class: this.$nymph.getEntityClass(Resource), skipAc: true },
        {
          type: '&',
          ref: ['parent', this],
        },
      )
    ) {
      throw new ForbiddenError('This resource is not empty.');
    }

    const transaction = 'resource-move-' + this.guid;
    const nymph = this.$nymph;
    const tnymph = await nymph.startTransaction(transaction);
    this.$setNymph(tnymph);

    try {
      if (existingResource) {
        existingResource.$setNymph(tnymph);

        if (
          await tnymph.getEntity(
            { class: tnymph.getEntityClass(Resource), skipAc: true },
            {
              type: '&',
              ref: ['parent', existingResource],
            },
          )
        ) {
          throw new ForbiddenError('The destination resource is not empty.');
        }

        // Delete the existing resource.
        if (!(await existingResource.$delete())) {
          throw new InternalServerError(
            "Couldn't delete destination resource.",
          );
        }
      }

      // Delete existing locks on this resource.
      const locks = await tnymph.getEntities(
        {
          class: tnymph.getEntityClass(NymphLock),
          skipAc: true,
        },
        {
          type: '&',
          ref: ['resource', this],
        },
      );

      for (let lock of locks) {
        if (!(await lock.$deleteSkipAC())) {
          throw new InternalServerError("Couldn't delete associated lock.");
        }
      }

      this.$data.name = name;
      this.$data.parent = destinationParent;

      if (!(await this.$save())) {
        throw new InternalServerError("Couldn't save destination resource.");
      }

      await tnymph.commit(transaction);
      this.$setNymph(nymph);
      if (existingResource) {
        existingResource.$setNymph(nymph);
      }
    } catch (e: any) {
      await tnymph.rollback(transaction);
      this.$setNymph(nymph);
      if (existingResource) {
        existingResource.$setNymph(nymph);
      }
      try {
        // Refresh the entity, since there might be referenced entities that
        // think they're deleted, but aren't really because of the rollback.
        await this.$refresh();
        if (existingResource) {
          existingResource.$refresh();
        }
      } catch (e: any) {
        // Ignore this error.
      }
      throw e;
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

    const selector: Selector = {
      type: '&',
      equal: ['name', this.$data.name],
    };
    if (this.$data.parent != null) {
      selector['ref'] = ['parent', this.$data.parent];
    }
    if (this.guid != null) {
      selector['!guid'] = this.guid;
    }
    if (
      await this.$nymph.getEntity(
        { class: this.$nymph.getEntityClass(Resource) },
        selector
      )
    ) {
      throw new ResourceExistsError('This resource already exists.');
    }

    // Validate the entity's data.
    try {
      Joi.attempt(
        this.$getValidatable(),
        Joi.object().keys({
          ...nymphJoiProps,
          ...tilmeldJoiProps,

          name: Joi.string()
            .max(255)
            .pattern(/\//, {
              invert: true,
              name: 'must not contain forward slash',
            })
            .required(),
          size: Joi.number().required(),
          contentType: Joi.string().trim(false).max(255).required(),
          collection: Joi.boolean().required(),
          hash: Joi.string().trim(false).hex().length(96).required(),
          properties: Joi.object().pattern(
            Joi.string().trim(false).max(2048),
            Joi.alternatives().try(
              Joi.string().trim(false).allow('').max(65536),
              Joi.array().items(Joi.string().trim(false).allow('').max(65536)),
            ),
          ),
          parent: Joi.object().instance(Resource),
        }),
        'Invalid Resource: ',
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

  async $delete() {
    if (
      await this.$nymph.getEntity(
        { class: this.$nymph.getEntityClass(Resource), skipAc: true },
        {
          type: '&',
          ref: ['parent', this],
        },
      )
    ) {
      throw new ForbiddenError("This resource isn't empty.");
    }

    const transaction = 'resource-delete-' + this.guid;
    const nymph = this.$nymph;
    const tnymph = await nymph.startTransaction(transaction);
    this.$setNymph(tnymph);

    try {
      // Delete this entity's locks.
      const locks = await tnymph.getEntities(
        {
          class: tnymph.getEntityClass(NymphLock),
          skipAc: true,
        },
        {
          type: '&',
          ref: ['resource', this],
        },
      );

      for (let lock of locks) {
        if (!(await lock.$deleteSkipAC())) {
          throw new InternalServerError("Couldn't delete associated lock.");
        }
      }

      // Delete resource.
      let success = await super.$delete();
      if (success) {
        success = await tnymph.commit(transaction);
      } else {
        await tnymph.rollback(transaction);
      }
      this.$setNymph(nymph);
      if (!success) {
        // Refresh the entity, since there might be referenced entities that
        // think they're deleted, but aren't really because of the rollback.
        await this.$refresh();
      }
      return success;
    } catch (e: any) {
      await tnymph.rollback(transaction);
      this.$setNymph(nymph);
      try {
        // Refresh the entity, since there might be referenced entities that
        // think they're deleted, but aren't really because of the rollback.
        await this.$refresh();
      } catch (e: any) {
        // Ignore this error.
      }
      throw e;
    }
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
