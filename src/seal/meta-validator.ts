import type { RawClassMeta, MetaStore } from '../metadata';

import { BakerError } from '../common';
import { CollectionType } from '../metadata';
import { RESERVED_PROPERTY_NAMES } from './constants';

/**
 * Seal-time invariant checks on the merged metadata, run from sealOne after merge + type normalization
 * and before codegen. Holds the {@link MetaStore} (for @Field-presence checks) as an injected collaborator.
 * Throws BakerError on the first violation.
 *
 * Covers W2 (D7 + D9):
 * - Discriminator shape: empty subTypes / invalid subType entry / name collision / missing/reserved property
 * - Set/Map pairing: when a setValue/mapValue thunk is present, its target class must have @Field metadata
 *   (a primitive Set/Map with no value thunk is valid and intentionally not flagged)
 */
export class MetaValidator {
  readonly #meta: MetaStore;

  constructor(meta: MetaStore) {
    this.#meta = meta;
  }

  validateShape(Class: Function, merged: RawClassMeta): void {
    const className = Class.name;

    for (const [key, meta] of Object.entries(merged)) {
      // ─── Discriminator shape ─────────────────────────────────────────────
      if (meta.type?.discriminator) {
        const disc = meta.type.discriminator;
        if (typeof disc.property !== 'string' || disc.property.length === 0) {
          throw new BakerError(`${className}.${key}: discriminator.property must be a non-empty string.`);
        }
        // The discriminator property is written back onto the result object (keepDiscriminatorProperty),
        // so a reserved name there is a prototype-pollution vector — reject it like any banned field key.
        if (RESERVED_PROPERTY_NAMES.has(disc.property)) {
          throw new BakerError(
            `${className}.${key}: discriminator.property '${disc.property}' is a reserved property name and cannot be used.`,
          );
        }
        if (!Array.isArray(disc.subTypes) || disc.subTypes.length === 0) {
          throw new BakerError(
            `${className}.${key}: discriminator.subTypes must be a non-empty array of { value, name } entries.`,
          );
        }
        const seenNames = new Set<string>();
        for (let i = 0; i < disc.subTypes.length; i++) {
          const sub = disc.subTypes[i]!;
          if (typeof sub.name !== 'string' || sub.name.length === 0) {
            throw new BakerError(`${className}.${key}: discriminator.subTypes[${i}].name must be a non-empty string.`);
          }
          if (typeof sub.value !== 'function') {
            throw new BakerError(
              `${className}.${key}: discriminator.subTypes[${i}].value must be a class constructor (got ${typeof sub.value}).`,
            );
          }
          if (seenNames.has(sub.name)) {
            throw new BakerError(
              `${className}.${key}: discriminator.subTypes has duplicate name '${sub.name}'. Each subType must have a unique name.`,
            );
          }
          seenNames.add(sub.name);
          // subType class must have @Field metadata (RAW) — otherwise codegen will fail with a less clear error
          if (!this.#meta.hasOwn(sub.value)) {
            throw new BakerError(
              `${className}.${key}: discriminator.subTypes[${i}].value (${sub.value.name}) has no @Field decorators.`,
            );
          }
        }
      }

      // ─── Set/Map collection pairing — unified single-pass check ──────────
      const collection = meta.type?.collection;
      if (collection !== undefined && meta.type?.resolvedCollectionValue) {
        const target = meta.type.resolvedCollectionValue;
        if (!this.#meta.hasOwn(target)) {
          const accessor = collection === CollectionType.Set ? 'setValue' : 'mapValue';
          throw new BakerError(`${className}.${key}: ${accessor} target (${target.name}) has no @Field decorators.`);
        }
      }
    }
  }
}
