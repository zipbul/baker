// ─────────────────────────────────────────────────────────────────────────────
// Shared code-generation utilities for deserialize/serialize builders
// ─────────────────────────────────────────────────────────────────────────────

import type { RawPropertyMeta } from '../metadata';
import type { SealedExecutors } from './interfaces';

import { BakerError, Direction } from '../common';

/** Convert key to a valid JS identifier suffix (encode non-alphanumeric chars via charCode to prevent collisions) */
export function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, ch => `$${ch.charCodeAt(0)}$`);
}

/**
 * Resolve the rename target for a field in `direction`: the @Expose `name` from a same-direction-only
 * entry if present, else a bidirectional @Expose `name`, else the field key itself. The single source
 * of truth for both deserialize extract-key and serialize output-key resolution (they are mirror images
 * differing only in which directional flag they honour).
 */
export function resolveExposeName(fieldKey: string, exposeStack: RawPropertyMeta['expose'], direction: Direction): string {
  const directional =
    direction === Direction.Serialize
      ? exposeStack.find(e => e.serializeOnly && e.name)
      : exposeStack.find(e => e.deserializeOnly && e.name);
  if (directional) {
    return directional.name!;
  }
  // Non-directional @Expose with name → use for both directions
  const biDef = exposeStack.find(e => !e.deserializeOnly && !e.serializeOnly && e.name);
  if (biDef) {
    return biDef.name!;
  }
  return fieldKey;
}

/**
 * Resolve a field's expose groups for `direction` — undefined (no restriction) if any unconditional
 * expose entry exists. Single source of truth for both directions: serialize skips deserialize-only
 * entries, deserialize skips serialize-only entries.
 */
export function resolveExposeGroups(exposeStack: RawPropertyMeta['expose'], direction: Direction): string[] | undefined {
  // Single-pass: scan once, bail out as soon as we see an unconditional entry, lazily allocate the Set.
  let all: Set<string> | null = null;
  for (const e of exposeStack) {
    if (direction === Direction.Serialize ? e.deserializeOnly : e.serializeOnly) {
      continue;
    }
    if (!e.groups || e.groups.length === 0) {
      return undefined;
    }
    if (all === null) {
      all = new Set<string>();
    }
    for (const g of e.groups) {
      all.add(g);
    }
  }
  return all === null ? undefined : [...all];
}

/**
 * Generate a groups-has expression for the fast-path single-group / Set pattern.
 * Checks if any of the given groups match the runtime groups.
 */
export function buildGroupsHasExpr(singleGroupVar: string, groupsVar: string, groups: string[]): string {
  const checks = groups.map(group => {
    const q = JSON.stringify(group);
    return `(${singleGroupVar}===${q} || (${groupsVar} && ${groupsVar}.has(${q})))`;
  });
  return checks.join(' || ');
}

/**
 * Resolve a nested class's sealed executor, or throw a clear seal-time error naming the owning class,
 * the nested class, and the codegen phase. Single source for the deserialize/serialize builders'
 * `resolveExecutor` — seal() seals every nested DTO (step 4) before either builder runs (steps 6/7),
 * so `sealed` is always present in practice; throwing here turns a would-be runtime "Cannot read
 * 'deserialize'/'serialize'/'merged' of undefined" into a clear seal-time error and removes the cast
 * at call sites.
 */
export function resolveNestedExecutor(
  resolve: (cls: Function) => SealedExecutors<unknown> | undefined,
  ownerName: string,
  cls: Function,
  phase: Direction,
): SealedExecutors<unknown> {
  const sealed = resolve(cls);
  if (sealed === undefined) {
    throw new BakerError(`${ownerName}: nested class '${cls.name}' was not sealed before ${phase} codegen.`);
  }
  return sealed;
}

/**
 * Determine whether a field should be skipped for `direction` due to @Exclude/@Expose — the
 * direction-mirrored logic shared by both builders' `generateFieldCode`: deserialize skips a field
 * whose @Exclude is not serializeOnly-only / whose @Expose entries are all serializeOnly; serialize
 * mirrors this on deserializeOnly. Returns the skip code (a debug comment, or `''`) when the field
 * should be skipped, or `null` when the caller should continue generating it normally.
 */
export function resolveFieldSkip(
  meta: RawPropertyMeta,
  direction: Direction,
  debug: boolean | undefined,
  fieldKey: string,
): string | null {
  const oppositeOnly = direction === Direction.Deserialize ? 'serializeOnly' : 'deserializeOnly';
  const sameOnly = direction === Direction.Deserialize ? 'deserializeOnly' : 'serializeOnly';

  // ⓪ Exclude opposite-direction-only / bidirectional → skip
  if (meta.exclude) {
    if (!meta.exclude[oppositeOnly]) {
      if (debug) {
        const reason = meta.exclude[sameOnly] ? sameOnly : 'bidirectional';
        return `// [baker] field ${JSON.stringify(fieldKey)} excluded (${reason} @Exclude)\n`;
      }
      return '';
    }
  }

  // Expose: if all @Expose entries are opposite-direction-only, skip this field
  if (meta.expose.length > 0 && meta.expose.every(e => e[oppositeOnly])) {
    if (debug) {
      return `// [baker] field ${JSON.stringify(fieldKey)} excluded (all @Expose entries are ${oppositeOnly})\n`;
    }
    return '';
  }

  return null;
}

/**
 * Emit the sync-transform Promise-return guard: a sync-declared transform returning a Promise is a
 * contract violation, so the value must be checked BEFORE it feeds the next transform/validation.
 * Identical shape on both directions — only the field key (baked into the message) and direction word
 * vary, both constant per field/direction, so callers may hoist and reuse the returned string across a
 * field's transform chain.
 */
export function emitPromiseGuard(varExpr: string, fieldKey: string, direction: Direction): string {
  const guardMsg = JSON.stringify(
    `@Field(${fieldKey}) ${direction} transform returned Promise. Declare the transform with async if it is asynchronous.`,
  );
  return `if (${varExpr} !== null && (typeof ${varExpr} === 'object' || typeof ${varExpr} === 'function') && typeof ${varExpr}.then === 'function') throw new BakerError(${guardMsg});\n`;
}
