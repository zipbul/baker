import type { EmitContext, EmittableRule } from './interfaces';

import { makeRule } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// isUint8Array — instanceof guard (self-narrowing, no typeof gate; mirrors isRegExp)
// ─────────────────────────────────────────────────────────────────────────────

export const isUint8Array = makeRule({
  name: 'isUint8Array',
  constraints: {},
  validate: value => value instanceof Uint8Array,
  emit: (varName: string, ctx: EmitContext): string => `if (!(${varName} instanceof Uint8Array)) ${ctx.fail('isUint8Array')};`,
});

// ─────────────────────────────────────────────────────────────────────────────
// isByteSize(min, max?) — byte length of any ArrayBufferView (binary analogue of isByteLength)
//
// The ArrayBuffer.isView guard MUST short-circuit before any .byteLength read: reading .byteLength
// on a non-view yields undefined (and undefined < min is false → would wrongly pass), and on
// null/undefined it throws. The guard-first else-if chain prevents both. .byteLength is inlined
// (not aliased to a local like isByteLength) — it is a trivial getter, not an expensive call.
//
// min/max are dev-supplied constants; per "trust TS for dev inputs" they are not runtime-guarded,
// consistent with isByteLength.
// ─────────────────────────────────────────────────────────────────────────────

export function isByteSize(min: number, max?: number): EmittableRule {
  return makeRule({
    name: 'isByteSize',
    constraints: max !== undefined ? { min, max } : { min },
    // Fail-form mirrors emit exactly (same as isByteLength), so validate() and the generated code
    // agree for ALL inputs — including degenerate NaN bounds, where pass-form (>= NaN) would reject
    // but the emitted (< NaN) accepts, breaking validate/emit parity.
    validate: value => {
      if (!ArrayBuffer.isView(value)) {
        return false;
      }
      const byteLen = (value as ArrayBufferView).byteLength;
      if (byteLen < min) {
        return false;
      }
      if (max !== undefined && byteLen > max) {
        return false;
      }
      return true;
    },
    emit: (varName: string, ctx: EmitContext): string => {
      let code = `if (!ArrayBuffer.isView(${varName})) ${ctx.fail('isByteSize')};`;
      code += `\nelse if (${varName}.byteLength < ${min}) ${ctx.fail('isByteSize')};`;
      if (max !== undefined) {
        code += `\nelse if (${varName}.byteLength > ${max}) ${ctx.fail('isByteSize')};`;
      }
      return code;
    },
  });
}
