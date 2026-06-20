import type { EmitContext, EmittableRule } from './types';

import { CacheKey } from '../common';
import { RequiredType, RuleOp } from './enums';
import { makePlannedRule, makeRule, planCompare, planLength, planOr } from './rule-plan';
import { makeStringRule } from './string-shared';

// ─────────────────────────────────────────────────────────────────────────────
// Group A: Length / Range
// ─────────────────────────────────────────────────────────────────────────────

function minLength(min: number): EmittableRule {
  const plan = { cacheKey: CacheKey.Length, failure: planCompare(planLength(), RuleOp.Lt, min) } as const;
  return makePlannedRule({
    name: 'minLength',
    requiresType: RequiredType.String,
    constraints: { min },
    plan,
    validate: value => typeof value === 'string' && value.length >= min,
  });
}

function maxLength(max: number): EmittableRule {
  const plan = { cacheKey: CacheKey.Length, failure: planCompare(planLength(), RuleOp.Gt, max) } as const;
  return makePlannedRule({
    name: 'maxLength',
    requiresType: RequiredType.String,
    constraints: { max },
    plan,
    validate: value => typeof value === 'string' && value.length <= max,
  });
}

function length(minLen: number, maxLen: number): EmittableRule {
  const plan = {
    cacheKey: CacheKey.Length,
    failure: planOr(planCompare(planLength(), RuleOp.Lt, minLen), planCompare(planLength(), RuleOp.Gt, maxLen)),
  } as const;
  return makePlannedRule({
    name: 'length',
    requiresType: RequiredType.String,
    constraints: { min: minLen, max: maxLen },
    plan,
    validate: value => typeof value === 'string' && value.length >= minLen && value.length <= maxLen,
  });
}

function contains(seed: string): EmittableRule {
  return makeRule({
    name: 'contains',
    requiresType: RequiredType.String,
    constraints: { seed },
    validate: value => typeof value === 'string' && value.includes(seed),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(seed);
      return `if (!${varName}.includes(refs[${i}])) ${ctx.fail('contains')};`;
    },
  });
}

function notContains(seed: string): EmittableRule {
  return makeRule({
    name: 'notContains',
    requiresType: RequiredType.String,
    constraints: { seed },
    validate: value => typeof value === 'string' && !value.includes(seed),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(seed);
      return `if (${varName}.includes(refs[${i}])) ${ctx.fail('notContains')};`;
    },
  });
}

function matches(pattern: string | RegExp, modifiers?: string): EmittableRule {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, modifiers);
  return makeRule({
    name: 'matches',
    requiresType: RequiredType.String,
    constraints: { pattern: re.source },
    validate: value => typeof value === 'string' && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('matches')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Group B: Simple Boolean Checks
// ─────────────────────────────────────────────────────────────────────────────

const isLowercase = makeRule({
  name: 'isLowercase',
  requiresType: RequiredType.String,
  constraints: {},
  validate: value => typeof value === 'string' && value === value.toLowerCase(),
  emit: (varName: string, ctx: EmitContext): string => `if (${varName} !== ${varName}.toLowerCase()) ${ctx.fail('isLowercase')};`,
});

const isUppercase = makeRule({
  name: 'isUppercase',
  requiresType: RequiredType.String,
  constraints: {},
  validate: value => typeof value === 'string' && value === value.toUpperCase(),
  emit: (varName: string, ctx: EmitContext): string => `if (${varName} !== ${varName}.toUpperCase()) ${ctx.fail('isUppercase')};`,
});

// ASCII: all code points in [0x00, 0x7F]
const ASCII_RE = new RegExp(`^[${String.fromCharCode(0)}-${String.fromCharCode(0x7f)}]*$`);
const isAscii = makeStringRule(
  'isAscii',
  v => ASCII_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ASCII_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isAscii')};`;
  },
);

// Alpha — [a-zA-Z]+ singleton
const ALPHA_DEFAULT_RE = /^[a-zA-Z]+$/;
// length > 0 guard is dead — `+` quantifier requires ≥1 char so the regex returns false on empty.
const isAlpha = makeStringRule(
  'isAlpha',
  v => ALPHA_DEFAULT_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ALPHA_DEFAULT_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isAlpha')};`;
  },
);

// Alphanumeric — [a-zA-Z0-9]+ singleton (same empty-input rationale as isAlpha)
const ALNUM_DEFAULT_RE = /^[a-zA-Z0-9]+$/;
const isAlphanumeric = makeStringRule(
  'isAlphanumeric',
  v => ALNUM_DEFAULT_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ALNUM_DEFAULT_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isAlphanumeric')};`;
  },
);

// HTTP token — RFC 9110 §5.6.2: token = 1*tchar.
// tchar = "!"/"#"/"$"/"%"/"&"/"'"/"*"/"+"/"-"/"."/"^"/"_"/"`"/"|"/"~" / DIGIT / ALPHA.
// Used for HTTP method names and header field-names (not field-values). The hyphen is
// escaped so it stays literal — an unescaped `+-.` would form a range that admits ",".
const HTTP_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const isHttpToken = makeStringRule(
  'isHttpToken',
  v => HTTP_TOKEN_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(HTTP_TOKEN_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isHttpToken')};`;
  },
);

// RFC 6454 §6.2 serialized origin — a string equal to WHATWG URL `.origin`.
// The opaque-origin literal 'null' is matched explicitly because `new URL('null')` throws.
// '*' (CORS wildcard) is rejected here; use isCorsOrigin for the CORS superset.
const isOriginValue = (value: string): boolean => {
  if (value === 'null') {
    return true;
  }
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};
const isOrigin = makeRule({
  name: 'isOrigin',
  requiresType: RequiredType.String,
  constraints: { format: 'origin' },
  validate: value => typeof value === 'string' && isOriginValue(value),
  emit: (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(isOriginValue);
    return `if (!(refs[${i}](${varName}))) ${ctx.fail('isOrigin')};`;
  },
});

// CORS superset of isOrigin: additionally accepts the '*' wildcard literal
// (Access-Control-Allow-Origin). Keep '*' out of the general isOrigin.
const isCorsOriginValue = (value: string): boolean => value === '*' || isOriginValue(value);
const isCorsOrigin = makeRule({
  name: 'isCorsOrigin',
  requiresType: RequiredType.String,
  constraints: { format: 'origin', allowWildcard: true },
  validate: value => typeof value === 'string' && isCorsOriginValue(value),
  emit: (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(isCorsOriginValue);
    return `if (!(refs[${i}](${varName}))) ${ctx.fail('isCorsOrigin')};`;
  },
});

// BooleanString: 'true' | 'false' | '1' | '0'
const isBooleanString = makeRule({
  name: 'isBooleanString',
  requiresType: RequiredType.String,
  constraints: {},
  validate: value => value === 'true' || value === 'false' || value === '1' || value === '0',
  emit: (varName: string, ctx: EmitContext): string =>
    `if (${varName} !== 'true' && ${varName} !== 'false' && ${varName} !== '1' && ${varName} !== '0') ${ctx.fail('isBooleanString')};`,
});

interface IsNumberStringOptions {
  no_symbols?: boolean;
}

const NO_SYMBOLS_RE = /^[0-9]+$/;
// A numeric string: optional sign, integer/decimal/leading-dot form. No whitespace, hex, or
// exponent — `Number()` coercion accepted all of those (e.g. "   ", "0x1A", "1e5"), which is far
// looser than "is this string a number". Matches validator.js's default isNumeric behavior.
const NUMERIC_STRING_RE = /^[+-]?(?:[0-9]*\.)?[0-9]+$/;

function isNumberString(options?: IsNumberStringOptions): EmittableRule {
  const noSymbols = options?.no_symbols ?? false;
  const re = noSymbols ? NO_SYMBOLS_RE : NUMERIC_STRING_RE;

  return makeStringRule(
    'isNumberString',
    (s: string): boolean => re.test(s),
    (varName, ctx) => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isNumberString')};`;
    },
    RequiredType.String,
    { no_symbols: noSymbols },
  );
}

function isDecimal(): EmittableRule {
  // Require a digit after the dot — `\d+(?:\.\d*)?` accepted a dangling "5.".
  const decimalRe = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/;
  return makeStringRule(
    'isDecimal',
    v => decimalRe.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(decimalRe);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isDecimal')};`;
    },
  );
}

export {
  minLength,
  maxLength,
  length,
  contains,
  notContains,
  matches,
  isLowercase,
  isUppercase,
  isAscii,
  isAlpha,
  isAlphanumeric,
  isHttpToken,
  isOrigin,
  isCorsOrigin,
  isBooleanString,
  isNumberString,
  isDecimal,
};
export type { IsNumberStringOptions };
