import type { RawClassMeta, ExposeDef } from '../metadata';

import { Direction, BakerError } from '../common';
import { RESERVED_PROPERTY_NAMES } from './constants';

/**
 * Static validation of @Expose stacks
 *
 * Check 1: same @Expose entry has deserializeOnly: true + serializeOnly: true → excluded from both directions
 * Check 2: if 2+ @Expose entries in the same direction have overlapping groups → BakerError
 *          - both groups=[] (ungrouped) → overlap
 *          - both non-empty groups with intersection → overlap
 *          - one ungrouped + one grouped → no overlap (different scope)
 */
function validateExposeStacks(merged: RawClassMeta, className?: string): void {
  const prefix = className ? `${className}.` : '';
  for (const [key, meta] of Object.entries(merged)) {
    // ① single-entry check: deserializeOnly + serializeOnly cannot coexist
    for (const exp of meta.expose) {
      if (exp.deserializeOnly && exp.serializeOnly) {
        throw new BakerError(
          `Invalid @Expose on field '${prefix}${key}': cannot have both deserializeOnly:true and serializeOnly:true on the same @Expose entry. Use separate @Expose decorators for each direction.`,
        );
      }
      // Reserved output keys would corrupt the serialized object (e.g. a '__proto__' key sets the
      // prototype instead of an own property) — reject them as wire names, matching banned field names.
      if (exp.name !== undefined && RESERVED_PROPERTY_NAMES.has(exp.name)) {
        throw new BakerError(
          `Invalid @Expose name on '${prefix}${key}': '${exp.name}' is a reserved property name and cannot be used as a serialized key.`,
        );
      }
    }

    // ② multi-entry check per direction
    // deserialize direction: !serializeOnly (includes bidirectional + deserializeOnly)
    const desEntries = meta.expose.filter(e => !e.serializeOnly);
    // serialize direction: !deserializeOnly (includes bidirectional + serializeOnly)
    const serEntries = meta.expose.filter(e => !e.deserializeOnly);

    checkDirectionOverlap(prefix + key, desEntries, Direction.Deserialize);
    checkDirectionOverlap(prefix + key, serEntries, Direction.Serialize);
  }
}

/**
 * Check for groups overlap between each pair of @Expose entries within the same direction
 */
function checkDirectionOverlap(key: string, entries: ExposeDef[], direction: Direction): void {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const aGroups = entries[i]!.groups ?? [];
      const bGroups = entries[j]!.groups ?? [];
      if (groupsOverlap(aGroups, bGroups)) {
        const bSet = new Set(bGroups);
        const overlapping = aGroups.filter(g => bSet.has(g));
        throw new BakerError(
          `@Expose conflict on '${key}': 2 @Expose stacks with '${direction}' direction and overlapping groups [${overlapping.join(', ')}]. Each direction must have at most one @Expose per group set.`,
        );
      }
    }
  }
}

/**
 * Determine whether two groups arrays overlap.
 * - both empty → overlap (same ungrouped scope)
 * - both non-empty with intersection → overlap
 * - one empty + one non-empty → no overlap (different filter scopes)
 */
function groupsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 && b.length === 0) {
    return true;
  }
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  return a.some(g => b.includes(g));
}
export { validateExposeStacks };
