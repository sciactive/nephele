import {
  EntityUniqueConstraintError,
  transaction,
  transactional,
  type Nymph,
} from '@nymphjs/nymph';
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
  parent: (Resource & ResourceData) | null;
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

  constructor() {
    super();

    this.$data.name = '';
    this.$data.size = 0;
    this.$data.contentType = '';
    this.$data.collection = false;
    this.$data.hash = '';
    this.$data.properties = {};
    this.$data.parent = null;
  }

  async $getUniques() {
    return [
      `${this.$data.user?.guid}:${this.$data.parent?.guid}:${this.$data.name}`,
    ];
  }

  $setNymph(nymph: Nymph) {
    this.$nymph = nymph;
    if (!this.$asleep()) {
      if (this.$data.user) {
        this.$data.user.$setNymph(nymph);
      }
      if (this.$data.group) {
        this.$data.group.$setNymph(nymph);
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
    await transaction(
      this.$nymph,
      'resource-copy-' + this.guid,
      async (nymph) => {
        this.$setNymph(nymph);
        if (existingResource) {
          existingResource.$setNymph(nymph);

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

          try {
            await existingResource.$delete();
          } catch (e: any) {
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

        try {
          await newNymphResource.$save();
        } catch (e: any) {
          throw new InternalServerError("Couldn't save destination resource.");
        }
      },
      async (nymph, committed) => {
        this.$setNymph(nymph);
        if (existingResource) {
          existingResource.$setNymph(nymph);
        }
        try {
          // Refresh the entity, since there might be referenced entities that
          // think they're deleted, but aren't really because of the rollback.
          if (!committed) {
            await this.$refresh();
            if (existingResource) {
              existingResource.$refresh();
            }
          }
        } catch (e: any) {
          // Ignore this error.
        }
      },
    );
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

    await transaction(
      this.$nymph,
      'resource-move-' + this.guid,
      async (nymph) => {
        this.$setNymph(nymph);
        if (existingResource) {
          existingResource.$setNymph(nymph);

          if (
            await this.$nymph.getEntity(
              { class: Resource, skipAc: true },
              { type: '&', ref: ['parent', existingResource] },
            )
          ) {
            throw new ForbiddenError('The destination resource is not empty.');
          }

          // Delete the existing resource.
          try {
            await existingResource.$delete();
          } catch (e: any) {
            throw new InternalServerError(
              "Couldn't delete destination resource.",
            );
          }
        }

        // Delete existing locks on this resource.
        const locks = await this.$nymph.getEntities(
          { class: NymphLock, skipAc: true },
          { type: '&', ref: ['resource', this] },
        );

        for (let lock of locks) {
          try {
            await lock.$deleteSkipAC();
          } catch (e: any) {
            throw new InternalServerError("Couldn't delete associated lock.");
          }
        }

        this.$data.name = name;
        this.$data.parent = destinationParent;

        try {
          await this.$save();
        } catch (e: any) {
          throw new InternalServerError("Couldn't save destination resource.");
        }
      },
      async (nymph, committed) => {
        this.$setNymph(nymph);
        if (existingResource) {
          existingResource.$setNymph(nymph);
        }
        try {
          // Refresh the entity, since there might be referenced entities that
          // think they're deleted, but aren't really because of the rollback.
          if (!committed) {
            await this.$refresh();
            if (existingResource) {
              existingResource.$refresh();
            }
          }
        } catch (e: any) {
          // Ignore this error.
        }
      },
    );
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

    if (!this.$data.parent) {
      this.$data.parent = null;
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
          parent: Joi.alternatives().try(
            Joi.any().allow(null),
            Joi.object().instance(Resource),
          ),
        }),
        'Invalid Resource: ',
      );
    } catch (e: any) {
      throw new BadRequestError(e.message);
    }

    try {
      return await super.$save();
    } catch (e: any) {
      if (e instanceof EntityUniqueConstraintError) {
        throw new ResourceExistsError('This resource already exists.');
      }
      throw e;
    }
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

  @transactional
  async $delete() {
    if (
      this.$data.collection &&
      (await this.$nymph.getEntity(
        { class: this.$nymph.getEntityClass(Resource), skipAc: true },
        { type: '&', ref: ['parent', this] },
      ))
    ) {
      throw new ForbiddenError("This resource isn't empty.");
    }

    // Delete this entity's locks.
    const locks = await this.$nymph.getEntities(
      { class: NymphLock, skipAc: true },
      { type: '&', ref: ['resource', this] },
    );

    for (let lock of locks) {
      try {
        await lock.$deleteSkipAC();
      } catch (e: any) {
        throw new InternalServerError("Couldn't delete associated lock.");
      }
    }

    // Delete resource.
    await super.$delete();
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
