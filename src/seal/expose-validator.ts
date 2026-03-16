import { SealError } from '../errors';
import type { RawClassMeta, ExposeDef } from '../types';

/**
 * Static validation of @Expose stacks (§4.1, §3.3)
 *
 * Check 1: same @Expose entry has deserializeOnly: true + serializeOnly: true → excluded from both directions
 * Check 2: if 2+ @Expose entries in the same direction have overlapping groups → SealError
 *          - both groups=[] (ungrouped) → overlap
 *          - both non-empty groups with intersection → overlap
 *          - one ungrouped + one grouped → no overlap (different scope)
 */
export function validateExposeStacks(merged: RawClassMeta, className?: string): void {
  const prefix = className ? `${className}.` : '';
  for (const [key, meta] of Object.entries(merged)) {
    // ① single-entry check: deserializeOnly + serializeOnly cannot coexist
    for (const exp of meta.expose) {
      if (exp.deserializeOnly && exp.serializeOnly) {
        throw new SealError(
          `Invalid @Expose on field '${prefix}${key}': cannot have both deserializeOnly:true and serializeOnly:true on the same @Expose entry. Use separate @Expose decorators for each direction.`,
        );
      }
    }

    // ② multi-entry check per direction
    // deserialize direction: !serializeOnly (includes bidirectional + deserializeOnly)
    const desEntries = meta.expose.filter(e => !e.serializeOnly);
    // serialize direction: !deserializeOnly (includes bidirectional + serializeOnly)
    const serEntries = meta.expose.filter(e => !e.deserializeOnly);

    _checkDirectionOverlap(prefix + key, desEntries, 'deserialize');
    _checkDirectionOverlap(prefix + key, serEntries, 'serialize');
  }
}

/**
 * Check for groups overlap between each pair of @Expose entries within the same direction
 */
function _checkDirectionOverlap(key: string, entries: ExposeDef[], direction: string): void {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const aGroups = entries[i]!.groups ?? [];
      const bGroups = entries[j]!.groups ?? [];
      if (_groupsOverlap(aGroups, bGroups)) {
        const bSet = new Set(bGroups);
        const overlapping = aGroups.length === 0 ? [] : aGroups.filter(g => bSet.has(g));
        throw new SealError(
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
function _groupsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length === 0 || b.length === 0) return false;
  return a.some(g => b.includes(g));
}
