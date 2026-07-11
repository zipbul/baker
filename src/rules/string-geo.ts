import type { EmitContext, EmittableRule } from './interfaces';

import { makeRule } from './rule-plan';
import { makeStringRule } from './string-shared';

const NUMERIC_RANGE_RE = /^-?\d+(\.\d+)?$/;

function rangeNumberOrString(name: string, lo: number, hi: number): EmittableRule<string | number> {
  const check = (value: unknown): boolean => {
    if (typeof value === 'number') {
      return value >= lo && value <= hi;
    }
    if (typeof value === 'string') {
      // parseFloat('90abc') = 90 — strict regex rejects trailing garbage; a match guarantees parseFloat is valid.
      if (!NUMERIC_RANGE_RE.test(value)) {
        return false;
      }
      const n = parseFloat(value);
      return n >= lo && n <= hi;
    }
    return false;
  };
  return makeRule<string | number>({
    name,
    constraints: {},
    validate: check,
    emit: (varName: string, ctx: EmitContext): string => {
      const ri = ctx.addRegex(NUMERIC_RANGE_RE);
      return (
        `if(typeof ${varName}==='number'){if(${varName}<${lo}||${varName}>${hi})${ctx.fail(name)};}` +
        `else if(typeof ${varName}==='string'){` +
        `if(!re[${ri}].test(${varName})){${ctx.fail(name)}}` +
        `else{var rg=parseFloat(${varName});if(rg<${lo}||rg>${hi})${ctx.fail(name)};}}` +
        `else{${ctx.fail(name)};}`
      );
    },
  });
}

// LatLong
const LAT_LONG_RE = /^[-+]?([1-8]?\d(?:\.\d+)?|90(?:\.0+)?),\s*[-+]?(180(?:\.0+)?|1[0-7]\d(?:\.\d+)?|\d{1,2}(?:\.\d+)?)$/;

function isLatLong(): EmittableRule<string> {
  return makeStringRule(
    'isLatLong',
    v => LAT_LONG_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(LAT_LONG_RE);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isLatLong')};`;
    },
  );
}

const isLatitude = rangeNumberOrString('isLatitude', -90, 90);

const isLongitude = rangeNumberOrString('isLongitude', -180, 180);

export { isLatLong, isLatitude, isLongitude };
