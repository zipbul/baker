import { collectValidation } from '../collect';
import { min, max, isPositive, isNegative, isDivisibleBy } from '../rules/number';
import type { ValidationOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// Number Decorators (§1.1 Number)
// ─────────────────────────────────────────────────────────────────────────────

/** value >= n (exclusive: true → value > n) */
export function Min(n: number, options?: ValidationOptions & { exclusive?: boolean }): PropertyDecorator {
  return (target, key) => {
    collectValidation(target as object, key as string, {
      rule: min(n, options?.exclusive ? { exclusive: true } : undefined),
      each: options?.each,
      groups: options?.groups,
      message: options?.message,
      context: options?.context,
    });
  };
}

/** value <= n (exclusive: true → value < n) */
export function Max(n: number, options?: ValidationOptions & { exclusive?: boolean }): PropertyDecorator {
  return (target, key) => {
    collectValidation(target as object, key as string, {
      rule: max(n, options?.exclusive ? { exclusive: true } : undefined),
      each: options?.each,
      groups: options?.groups,
      message: options?.message,
      context: options?.context,
    });
  };
}

/** value > 0 */
export function IsPositive(options?: ValidationOptions): PropertyDecorator {
  return (target, key) => {
    collectValidation(target as object, key as string, {
      rule: isPositive,
      each: options?.each,
      groups: options?.groups,
      message: options?.message,
      context: options?.context,
    });
  };
}

/** value < 0 */
export function IsNegative(options?: ValidationOptions): PropertyDecorator {
  return (target, key) => {
    collectValidation(target as object, key as string, {
      rule: isNegative,
      each: options?.each,
      groups: options?.groups,
      message: options?.message,
      context: options?.context,
    });
  };
}

/** value % n === 0 */
export function IsDivisibleBy(n: number, options?: ValidationOptions): PropertyDecorator {
  return (target, key) => {
    collectValidation(target as object, key as string, {
      rule: isDivisibleBy(n),
      each: options?.each,
      groups: options?.groups,
      message: options?.message,
      context: options?.context,
    });
  };
}
