// ─────────────────────────────────────────────────────────────────────────────
// Shared code-generation utilities for deserialize/serialize builders
// ─────────────────────────────────────────────────────────────────────────────

import type { RawPropertyMeta } from '../metadata';

import { Direction } from '../common';

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
