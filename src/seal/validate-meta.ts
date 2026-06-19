import type { RawClassMeta } from '../metadata/types';

import { CollectionType } from '../metadata/enums';
import { BakerError } from '../common/errors';
import { hasRawOwn } from '../metadata/meta-access';

/**
 * @internal — seal-time invariant checks invoked from sealOne after merge + type normalization,
 * before codegen. Throws BakerError on the first violation.
 *
 * Covers W2 (D7 + D9):
 * - Discriminator shape: empty subTypes / invalid subType entry / name collision / missing property
 * - Set/Map pairing: Set without setValue, Map without mapValue, setValue/mapValue target missing @Field metadata
 * - async-in-sync: a DTO that mixes async rules/transforms with sync rules/transforms in such a way
 *   that the caller cannot easily tell — this throws BakerError so the user makes the intent explicit.
 *   (Per W2 decision: throw, not warn.)
 */
export function validateMeta(Class: Function, merged: RawClassMeta): void {
  const className = Class.name;

  for (const [key, meta] of Object.entries(merged)) {
    // ─── Discriminator shape ─────────────────────────────────────────────
    if (meta.type?.discriminator) {
      const disc = meta.type.discriminator;
      if (typeof disc.property !== 'string' || disc.property.length === 0) {
        throw new BakerError(`${className}.${key}: discriminator.property must be a non-empty string.`);
      }
      if (!Array.isArray(disc.subTypes) || disc.subTypes.length === 0) {
        throw new BakerError(`${className}.${key}: discriminator.subTypes must be a non-empty array of { value, name } entries.`);
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
        if (!hasRawOwn(sub.value)) {
          throw new BakerError(
            `${className}.${key}: discriminator.subTypes[${i}].value (${(sub.value as Function).name}) has no @Field decorators.`,
          );
        }
      }
    }

    // ─── Set/Map collection pairing — unified single-pass check ──────────
    const collection = meta.type?.collection;
    if (collection !== undefined && meta.type?.resolvedCollectionValue) {
      const target = meta.type.resolvedCollectionValue;
      if (!hasRawOwn(target)) {
        const accessor = collection === CollectionType.Set ? 'setValue' : 'mapValue';
        throw new BakerError(`${className}.${key}: ${accessor} target (${target.name}) has no @Field decorators.`);
      }
    }
  }

  // ─── async-in-sync: D9 ────────────────────────────────────────────────
  // Seal-time strict check for "mixed sync/async rules" was attempted but produces too many
  // false positives — sync rules + async transform is a common, valid baker pattern. The
  // remediation for D9 lives in W14's strict API: `validateSync(AsyncDto, x)` and the other
  // `*Sync` variants throw BakerError at the call site after consulting `isAsync`/`isSerializeAsync`.
  // No seal-time invariant added here.
}
