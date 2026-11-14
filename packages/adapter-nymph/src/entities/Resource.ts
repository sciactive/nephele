import {
  EntityConstructor,
  EntityUniqueConstraintError,
  transaction,
  transactional,
} from '@nymphjs/nymph';
import { Entity, nymphValibotProps } from '@nymphjs/nymph';
import { enforceTilmeld, tilmeldValibotProps } from '@nymphjs/tilmeld';
import * as v from 'valibot';
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  ResourceExistsError,
  UnauthorizedError,
} from 'nephele';

import { Lock as NymphLock } from './Lock.js';

const ResourceSchema = v.strictObject({
  ...nymphValibotProps,
  ...tilmeldValibotProps,

  name: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.check(
      (input) => input === input.trim(),
      'String must not contain leading or trailing whitespace.',
    ),
    v.check(
      (input) => !input.match(/\//),
      'String must not contain forward slash.',
    ),
    v.maxLength(255),
  ),
  size: v.pipe(v.number(), v.integer(), v.gtValue(-1)),
  contentType: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.check(
      (input) => input === input.trim(),
      'String must not contain leading or trailing whitespace.',
    ),
    v.maxLength(255),
  ),
  collection: v.boolean(),
  hash: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.check(
      (input) => input === input.trim(),
      'String must not contain leading or trailing whitespace.',
    ),
    v.hexadecimal(),
    v.maxLength(96),
  ),
  properties: v.record(
    v.pipe(
      v.string(),
      v.nonEmpty(),
      v.check(
        (input) => input === input.trim(),
        'String must not contain leading or trailing whitespace.',
      ),
      v.maxLength(2048),
    ),
    v.union([
      v.union([
        v.pipe(
          v.string(),
          v.check(
            (input) => input === input.trim(),
            'String must not contain leading or trailing whitespace.',
          ),
          v.maxLength(65536),
        ),
        v.literal(''),
      ]),
      v.array(
        v.union([
          v.pipe(
            v.string(),
            v.check(
              (input) => input === input.trim(),
              'String must not contain leading or trailing whitespace.',
            ),
            v.maxLength(65536),
          ),
          v.literal(''),
        ]),
      ),
    ]),
  ),
  parent: v.nullable(v.lazy(() => v.instance(Resource))),
});

type ResourceData = Omit<
  v.InferInput<typeof ResourceSchema>,
  keyof typeof nymphValibotProps
>;

export interface Resource extends ResourceData {}

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

    this.name = '';
    this.size = 0;
    this.contentType = '';
    this.collection = false;
    this.hash = '';
    this.properties = {};
    this.parent = null;
  }

  async $getUniques() {
    return [`${this.user?.guid}:${this.parent?.guid}:${this.name}`];
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
              { class: Resource, skipAc: true },
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
        newNymphResource.size = this.size;
        newNymphResource.contentType = this.contentType;
        newNymphResource.collection = this.collection;
        newNymphResource.hash = this.hash;
        newNymphResource.properties = JSON.parse(
          JSON.stringify(this.properties),
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
        { class: Resource, skipAc: true },
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

        this.name = name;
        this.parent = destinationParent;

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

  public async $validate() {
    try {
      v.parse(ResourceSchema, this.$getValidatable());
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

    if (!this.parent) {
      this.parent = null;
    }

    // Validate the entity's data.
    await this.$validate();

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
      this.collection &&
      (await this.$nymph.getEntity(
        { class: Resource, skipAc: true },
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
