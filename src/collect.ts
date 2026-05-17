import type { RawClassMeta, RawPropertyMeta, RuleDef } from './types';

import { getRaw, hasRawOwn, setRaw } from './meta-access';
import { globalRegistry } from './registry';

// ─────────────────────────────────────────────────────────────────────────────
// ensureMeta — Internal utility (§3.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the RawPropertyMeta for the given propertyKey on ctor.
 * - Creates with default values if it doesn't exist.
 * - Automatically registers ctor in the global registry (registered if at least one decorator exists).
 */
export function ensureMeta(ctor: Function, key: string): RawPropertyMeta {
  // Create Class[RAW] if it doesn't exist (uses null prototype — zero prototype chain interference)
  // Note: hasOwn check is required — when inheriting classes, ctor.__proto__ === ParentClass,
  // so the ??= operator would find the parent's [RAW] and pollute it by storing child fields in the parent's RAW
  if (!hasRawOwn(ctor)) {
    setRaw(ctor, Object.create(null) as RawClassMeta);
    globalRegistry.add(ctor);
  }
  const raw = getRaw(ctor)!;

  // Create default meta if key doesn't exist
  return (raw[key] ??= {
    validation: [],
    transform: [],
    expose: [],
    exclude: null,
    type: null,
    flags: {},
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// collect* — Category-specific collection functions (§3.1)
// ─────────────────────────────────────────────────────────────────────────────

export function collectValidation(target: object, key: string, ruleDef: RuleDef): void {
  const meta = ensureMeta((target as { constructor: Function }).constructor, key);
  meta.validation.push(ruleDef);
}
