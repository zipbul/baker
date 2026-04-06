import type { EmitContext, EmittableRule } from '../types';
import { makeRule } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// isNotEmptyObject(options?) — not an empty object (at least 1 key)
// ─────────────────────────────────────────────────────────────────────────────

export interface IsNotEmptyObjectOptions {
  /** Whether to ignore keys with null/undefined values (default: false — do not ignore) */
  nullable?: boolean;
}

export function isNotEmptyObject(options?: IsNotEmptyObjectOptions): EmittableRule {
  const validate = (value: unknown): boolean => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value as object);
    if (options?.nullable) {
      return keys.some((k) => (value as Record<string, unknown>)[k] != null);
    }
    return keys.length > 0;
  };

  return makeRule({
    name: 'isNotEmptyObject',
    requiresType: 'object',
    constraints: { nullable: options?.nullable },
    validate,
    emit: (varName: string, ctx: EmitContext): string => {
      if (options?.nullable) {
        return `if (!Object.keys(${varName}).some(function(_k){return ${varName}[_k]!=null;})) ${ctx.fail('isNotEmptyObject')};`;
      }
      return `if (Object.keys(${varName}).length === 0) ${ctx.fail('isNotEmptyObject')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isInstance(targetType) — checks if value is an instance of a specific class
// ─────────────────────────────────────────────────────────────────────────────

export function isInstance(targetType: new (...args: any[]) => any): EmittableRule {
  return makeRule({
    name: 'isInstance',
    constraints: { type: targetType.name },
    validate: (value) => value instanceof targetType,
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(targetType);
      return `if (!(${varName} instanceof _refs[${i}])) ${ctx.fail('isInstance')};`;
    },
  });
}
