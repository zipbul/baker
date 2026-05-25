import { globalRegistry } from '../registry';

// ─────────────────────────────────────────────────────────────────────────────
// @Recipe — class decorator that registers a DTO for argless seal()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks a class as a baker DTO so `seal()` (called with no arguments) discovers and seals it.
 *
 * Modern (TC39) field decorators receive no class reference, so `@Field` alone cannot register
 * the owning class. `@Recipe` runs after the field decorators and registers the class itself.
 *
 * @example
 * ```ts
 * \@Recipe
 * class UserDto {
 *   \@Field(isString()) name!: string;
 * }
 * seal();
 * ```
 */
function Recipe<T extends Function>(value: T, _context: ClassDecoratorContext): void {
  globalRegistry.add(value);
}

export { Recipe };
