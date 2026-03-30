import { RAW } from './symbols';
import { globalRegistry } from './registry';
import type { RawPropertyMeta, RuleDef, TransformDef, ExposeDef, ExcludeDef, TypeDef } from './types';

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
  // Note: hasOwnProperty check is required — when inheriting classes, ctor.__proto__ === ParentClass,
  // so the ??= operator would find the parent's [RAW] and pollute it by storing child fields in the parent's RAW
  if (!Object.prototype.hasOwnProperty.call(ctor, RAW)) {
    (ctor as any)[RAW] = Object.create(null) as Record<string, RawPropertyMeta>;
    globalRegistry.add(ctor);
  }
  const raw = (ctor as any)[RAW] as Record<string, RawPropertyMeta>;

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
  const meta = ensureMeta((target as any).constructor, key);
  meta.validation.push(ruleDef);
}

export function collectTransform(target: object, key: string, transformDef: TransformDef): void {
  const meta = ensureMeta((target as any).constructor, key);
  meta.transform.push(transformDef);
}

export function collectExpose(target: object, key: string, exposeDef: ExposeDef): void {
  const meta = ensureMeta((target as any).constructor, key);
  meta.expose.push(exposeDef);
}

export function collectExclude(target: object, key: string, excludeDef: ExcludeDef): void {
  const meta = ensureMeta((target as any).constructor, key);
  meta.exclude = excludeDef;
}

export function collectType(target: object, key: string, typeDef: TypeDef): void {
  const meta = ensureMeta((target as any).constructor, key);
  meta.type = typeDef;
}

