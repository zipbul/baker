import type { ClassCtor } from '../common';
import type { RawClassMeta } from '../metadata';

import { BakerError } from '../common';
import { PRIMITIVE_CTORS } from './constants';
import { classifyTypeResult } from './type-resolver';

/**
 * Seal-time normalization of each field's `@Type`/`@Field` type thunk: resolve `type.fn()`, detect
 * Map/Set collections and the `[Element]` array form, exclude primitive constructors, and auto-infer the
 * `validateNested`/`validateNestedEach` flags for DTO classes. Mutates `merged` in place — it reassigns
 * `merged[key]` with a copy-on-write `type` (never mutating the shared RAW `type`) and mutates the
 * already-per-seal-cloned `meta.flags` directly. Stateless — a plain function (no instance needed).
 */
export function normalizeTypeDefs(merged: RawClassMeta, className: string): void {
  for (const [key, meta] of Object.entries(merged)) {
    if (!meta.type?.fn) {
      continue;
    }
    let typeResult: unknown;
    try {
      typeResult = meta.type.fn();
    } catch (e) {
      throw new BakerError(`${className}.${key}: type function threw: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }

    const { collection, isArray, resolved } = classifyTypeResult(typeResult);

    // Detect Map/Set collection
    if (collection !== undefined) {
      const typeCopy = { ...meta.type, collection, isArray: false };
      // collectionValue thunk → cache resolvedCollectionValue
      if (meta.type.collectionValue) {
        let valCls: unknown;
        try {
          valCls = meta.type.collectionValue();
        } catch (e) {
          throw new BakerError(
            `${className}.${key}: collectionValue function threw: ${e instanceof Error ? e.message : String(e)}`,
            {
              cause: e,
            },
          );
        }
        if (valCls != null && typeof valCls === 'function' && !PRIMITIVE_CTORS.has(valCls)) {
          typeCopy.resolvedCollectionValue = valCls as ClassCtor;
        }
      }
      merged[key] = { ...meta, type: typeCopy };
      continue;
    }

    if (resolved == null || typeof resolved !== 'function') {
      throw new BakerError(`${className}: @Type/@Field type must return a constructor or [constructor], got ${String(resolved)}`);
    }
    // Copy type object before mutating — preserve original RAW type reference
    const typeCopy = { ...meta.type, isArray };
    if (!PRIMITIVE_CTORS.has(resolved)) {
      typeCopy.resolvedClass = resolved as ClassCtor;
      // Automatically set validateNested flags for DTO classes. `meta.flags` is already a per-seal
      // copy (mergeInheritance clones it), so mutate it directly — no second copy-on-write here.
      if (!meta.flags.validateNested) {
        meta.flags.validateNested = true;
      }
      if (isArray && !meta.flags.validateNestedEach) {
        meta.flags.validateNestedEach = true;
      }
    }
    merged[key] = { ...meta, type: typeCopy };
  }
}
