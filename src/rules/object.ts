import type { EmitContext, EmittableRule } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// isNotEmptyObject(options?) — not an empty object (at least 1 key)
// ─────────────────────────────────────────────────────────────────────────────

export interface IsNotEmptyObjectOptions {
  /** Whether to ignore keys with null/undefined values (default: false — do not ignore) */
  nullable?: boolean;
}

export function isNotEmptyObject(options?: IsNotEmptyObjectOptions): EmittableRule {
  const fn = (value: unknown): boolean => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value as object);
    if (options?.nullable) {
      return keys.some((k) => (value as Record<string, unknown>)[k] != null);
    }
    return keys.length > 0;
  };

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    if (options?.nullable) {
      const i = ctx.addRef(fn);
      return `if (!_refs[${i}](${varName})) ${ctx.fail('isNotEmptyObject')};`;
    }
    return `if (Object.keys(${varName}).length === 0) ${ctx.fail('isNotEmptyObject')};`;
  };
  (fn as any).ruleName = 'isNotEmptyObject';
  (fn as any).constraints = { nullable: options?.nullable };

  return fn as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// isInstance(targetType) — checks if value is an instance of a specific class
// ─────────────────────────────────────────────────────────────────────────────

export function isInstance(targetType: new (...args: any[]) => any): EmittableRule {
  const fn = (value: unknown): boolean => value instanceof targetType;

  (fn as any).emit = (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(targetType);
    return `if (!(${varName} instanceof _refs[${i}])) ${ctx.fail('isInstance')};`;
  };
  (fn as any).ruleName = 'isInstance';
  (fn as any).constraints = { type: targetType.name };

  return fn as EmittableRule;
}
