import { _ensureSealed } from '../seal/seal';
import type { RawClassMeta } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// getMeta — Public API (§6.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the fully resolved metadata for a decorated DTO class.
 * - Auto-seals on first call if not already sealed
 * - Includes inheritance-merged fields with resolved types
 * - Throws SealError if class has no @Field decorators
 *
 * @example
 * const meta = getMeta(UserDto);
 * for (const [field, prop] of Object.entries(meta)) {
 *   prop.validation  // RuleDef[] — rules with constraints
 *   prop.type        // TypeDef — nested class, array, collection info
 *   prop.flags       // PropertyFlags — optional, nullable, etc.
 * }
 */
export function getMeta(Class: Function): RawClassMeta {
  const sealed = _ensureSealed(Class);
  return sealed._merged!;
}
