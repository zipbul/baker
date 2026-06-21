import type { EmitContext, EmittableRule } from './interfaces';

import { RequiredType } from './enums';
import { makeRule } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// isNotEmptyObject(options?) — not an empty object (at least 1 key)
// ─────────────────────────────────────────────────────────────────────────────

export interface IsNotEmptyObjectOptions {
  /** Whether to ignore keys with null/undefined values (default: false — do not ignore) */
  nullable?: boolean;
}

export function isNotEmptyObject(options?: IsNotEmptyObjectOptions): EmittableRule {
  const validate = (value: unknown): boolean => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    if (options?.nullable) {
      for (const k in obj) {
        if (obj[k] != null) {
          return true;
        }
      }
      return false;
    }
    for (const _k in obj) {
      return true;
    }
    return false;
  };

  return makeRule({
    name: 'isNotEmptyObject',
    requiresType: RequiredType.Object,
    constraints: options?.nullable !== undefined ? { nullable: options.nullable } : {},
    validate,
    // Codegen: for-in with break — measured ~1 ns faster than Object.keys allocation
    // (Bun 1.3.13 / i7-13700K). The generated body is not subject to source-lint rules.
    emit: (varName: string, ctx: EmitContext): string => {
      if (options?.nullable) {
        return `{var __ne=false;for(var __k in ${varName}){if(${varName}[__k]!=null){__ne=true;break;}}if(!__ne) ${ctx.fail('isNotEmptyObject')};}`;
      }
      return `{var __ne=false;for(var __k in ${varName}){__ne=true;break;}if(!__ne) ${ctx.fail('isNotEmptyObject')};}`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// isInstance(targetType) — checks if value is an instance of a specific class
// ─────────────────────────────────────────────────────────────────────────────

export function isInstance(targetType: new (...args: never[]) => object): EmittableRule {
  return makeRule({
    name: 'isInstance',
    constraints: { type: targetType.name },
    validate: value => value instanceof targetType,
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(targetType);
      return `if (!(${varName} instanceof refs[${i}])) ${ctx.fail('isInstance')};`;
    },
  });
}
