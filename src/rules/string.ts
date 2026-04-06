import type { EmitContext, EmittableRule } from '../types';
import { makePlannedRule, makeRule, planCompare, planLength, planOr } from '../rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeStringRule(
  name: string,
  validate: (v: string) => boolean,
  buildEmit: (varName: string, ctx: EmitContext) => string,
  requiresType: 'string' | undefined = 'string',
  constraints: Record<string, unknown> = {},
): EmittableRule {
  return makeRule({
    name,
    requiresType,
    constraints,
    validate: (value) => typeof value === 'string' && validate(value),
    emit: buildEmit,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Group A: Length / Range
// ─────────────────────────────────────────────────────────────────────────────

export function minLength(min: number): EmittableRule {
  const plan = { cacheKey: 'length', failure: planCompare(planLength(), '<', min) } as const;
  return makePlannedRule({
    name: 'minLength',
    requiresType: 'string',
    constraints: { min },
    plan,
    validate: (value) => typeof value === 'string' && value.length >= min,
  });
}

export function maxLength(max: number): EmittableRule {
  const plan = { cacheKey: 'length', failure: planCompare(planLength(), '>', max) } as const;
  return makePlannedRule({
    name: 'maxLength',
    requiresType: 'string',
    constraints: { max },
    plan,
    validate: (value) => typeof value === 'string' && value.length <= max,
  });
}

export function length(minLen: number, maxLen: number): EmittableRule {
  const plan = {
    cacheKey: 'length',
    failure: planOr(
      planCompare(planLength(), '<', minLen),
      planCompare(planLength(), '>', maxLen),
    ),
  } as const;
  return makePlannedRule({
    name: 'length',
    requiresType: 'string',
    constraints: { min: minLen, max: maxLen },
    plan,
    validate: (value) =>
      typeof value === 'string' && value.length >= minLen && value.length <= maxLen,
  });
}

export function contains(seed: string): EmittableRule {
  return makeRule({
    name: 'contains',
    requiresType: 'string',
    constraints: { seed },
    validate: (value) => typeof value === 'string' && value.includes(seed),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(seed);
      return `if (${varName}.indexOf(_refs[${i}]) === -1) ${ctx.fail('contains')};`;
    },
  });
}

export function notContains(seed: string): EmittableRule {
  return makeRule({
    name: 'notContains',
    requiresType: 'string',
    constraints: { seed },
    validate: (value) => typeof value === 'string' && !value.includes(seed),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRef(seed);
      return `if (${varName}.indexOf(_refs[${i}]) !== -1) ${ctx.fail('notContains')};`;
    },
  });
}

export function matches(pattern: string | RegExp, modifiers?: string): EmittableRule {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, modifiers);
  return makeRule({
    name: 'matches',
    requiresType: 'string',
    constraints: { pattern: re.source },
    validate: (value) => typeof value === 'string' && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRegex(re);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('matches')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Group B: Simple Boolean Checks
// ─────────────────────────────────────────────────────────────────────────────

export const isLowercase = makeRule({
  name: 'isLowercase',
  requiresType: 'string',
  constraints: {},
  validate: (value) => typeof value === 'string' && value === value.toLowerCase(),
  emit: (varName: string, ctx: EmitContext): string =>
    `if (${varName} !== ${varName}.toLowerCase()) ${ctx.fail('isLowercase')};`,
});

export const isUppercase = makeRule({
  name: 'isUppercase',
  requiresType: 'string',
  constraints: {},
  validate: (value) => typeof value === 'string' && value === value.toUpperCase(),
  emit: (varName: string, ctx: EmitContext): string =>
    `if (${varName} !== ${varName}.toUpperCase()) ${ctx.fail('isUppercase')};`,
});

// ASCII: all code points in [0x00, 0x7F]
const ASCII_RE = /^[\x00-\x7F]*$/;
export const isAscii = makeStringRule(
  'isAscii',
  (v) => ASCII_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ASCII_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isAscii')};`;
  },
);

// Alpha — [a-zA-Z]+ singleton
const ALPHA_DEFAULT_RE = /^[a-zA-Z]+$/;
export const isAlpha = makeStringRule(
  'isAlpha',
  (v) => v.length > 0 && ALPHA_DEFAULT_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ALPHA_DEFAULT_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isAlpha')};`;
  },
);

// Alphanumeric — [a-zA-Z0-9]+ singleton
const ALNUM_DEFAULT_RE = /^[a-zA-Z0-9]+$/;
export const isAlphanumeric = makeStringRule(
  'isAlphanumeric',
  (v) => v.length > 0 && ALNUM_DEFAULT_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ALNUM_DEFAULT_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isAlphanumeric')};`;
  },
);

// BooleanString: 'true' | 'false' | '1' | '0'
export const isBooleanString = makeRule({
  name: 'isBooleanString',
  requiresType: 'string',
  constraints: {},
  validate: (value) => value === 'true' || value === 'false' || value === '1' || value === '0',
  emit: (varName: string, ctx: EmitContext): string =>
    `if (${varName} !== 'true' && ${varName} !== 'false' && ${varName} !== '1' && ${varName} !== '0') ${ctx.fail('isBooleanString')};`,
});

export interface IsNumberStringOptions {
  no_symbols?: boolean;
}

const NO_SYMBOLS_RE = /^[0-9]+$/;

export function isNumberString(options?: IsNumberStringOptions): EmittableRule {
  const noSymbols = options?.no_symbols ?? false;

  const checkFn = noSymbols
    ? (s: string): boolean => s.length > 0 && NO_SYMBOLS_RE.test(s)
    : (s: string): boolean => {
        if (s.length === 0) return false;
        const n = Number(s);
        return !isNaN(n) && isFinite(n);
      };

  return makeStringRule(
    'isNumberString',
    checkFn,
    (varName, ctx) => {
      if (noSymbols) {
        const i = ctx.addRegex(NO_SYMBOLS_RE);
        return `if (${varName}.length === 0 || !_re[${i}].test(${varName})) ${ctx.fail('isNumberString')};`;
      }
      return `if (${varName}.length === 0) ${ctx.fail('isNumberString')};\nelse { var _ns=Number(${varName}); if (isNaN(_ns) || !isFinite(_ns)) ${ctx.fail('isNumberString')}; }`;
    },
    'string',
    { no_symbols: noSymbols },
  );
}

export function isDecimal(): EmittableRule {
  const decimalRe = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  return makeStringRule(
    'isDecimal',
    (v) => decimalRe.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(decimalRe);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isDecimal')};`;
    },
  );
}

// Full-width characters (Unicode fullwidth forms)
const FULLWIDTH_RE = /[^\u0020-\u007E\uFF61-\uFF9F]/;
export const isFullWidth = makeStringRule(
  'isFullWidth',
  (v) => v.length > 0 && FULLWIDTH_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(FULLWIDTH_RE);
    return `if (${varName}.length === 0 || !_re[${i}].test(${varName})) ${ctx.fail('isFullWidth')};`;
  },
);

// Half-width characters
const HALFWIDTH_RE = /[\u0020-\u007E\uFF61-\uFF9F]/;
export const isHalfWidth = makeStringRule(
  'isHalfWidth',
  (v) => v.length > 0 && HALFWIDTH_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(HALFWIDTH_RE);
    return `if (${varName}.length === 0 || !_re[${i}].test(${varName})) ${ctx.fail('isHalfWidth')};`;
  },
);

// Variable-width: must contain both full-width AND half-width
export const isVariableWidth = makeStringRule(
  'isVariableWidth',
  (v) => v.length > 0 && FULLWIDTH_RE.test(v) && HALFWIDTH_RE.test(v),
  (varName, ctx) => {
    const i1 = ctx.addRegex(FULLWIDTH_RE);
    const i2 = ctx.addRegex(HALFWIDTH_RE);
    return `if (${varName}.length === 0 || !_re[${i1}].test(${varName}) || !_re[${i2}].test(${varName})) ${ctx.fail('isVariableWidth')};`;
  },
);

// Multibyte: any character outside Latin-1 / half-width range
const MULTIBYTE_RE = /[^\x00-\xFF]/;
export const isMultibyte = makeStringRule(
  'isMultibyte',
  (v) => v.length > 0 && MULTIBYTE_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MULTIBYTE_RE);
    return `if (${varName}.length === 0 || !_re[${i}].test(${varName})) ${ctx.fail('isMultibyte')};`;
  },
);

// Surrogate pairs
const SURROGATE_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;
export const isSurrogatePair = makeStringRule(
  'isSurrogatePair',
  (v) => v.length > 0 && SURROGATE_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(SURROGATE_RE);
    return `if (${varName}.length === 0 || !_re[${i}].test(${varName})) ${ctx.fail('isSurrogatePair')};`;
  },
);

// Hexadecimal
const HEX_RE = /^[0-9a-fA-F]+$/;
export const isHexadecimal = makeStringRule(
  'isHexadecimal',
  (v) => HEX_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(HEX_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isHexadecimal')};`;
  },
);

// Octal
const OCTAL_RE = /^(0[oO])?[0-7]+$/;
export const isOctal = makeStringRule(
  'isOctal',
  (v) => v.length > 0 && OCTAL_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(OCTAL_RE);
    return `if (${varName}.length === 0 || !_re[${i}].test(${varName})) ${ctx.fail('isOctal')};`;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Group C: Regex-based
// ─────────────────────────────────────────────────────────────────────────────

// Email — RFC 5322 simplified
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function isEmail(): EmittableRule {
  return makeStringRule(
    'isEmail',
    (v) => EMAIL_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(EMAIL_RE);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isEmail')};`;
    },
    'string',
    { format: 'email' },
  );
}

// URL — RFC 3986 simplified
export interface IsURLOptions {
  protocols?: string[];
}

const URL_PROTOCOLS_DEFAULT = ['http', 'https', 'ftp'];

export function isURL(options?: IsURLOptions): EmittableRule {
  const protocols = options?.protocols ?? URL_PROTOCOLS_DEFAULT;
  const protocolPattern = protocols.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(
    `^(?:${protocolPattern}):\\/\\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)(?::(6553[0-5]|655[0-2]\\d|65[0-4]\\d{2}|6[0-4]\\d{3}|[1-5]\\d{4}|[1-9]\\d{0,3}|0))?(?:\\/[^\\s]*)?$`,
  );
  return makeRule({
    name: 'isURL',
    requiresType: 'string',
    constraints: { format: 'uri', protocols },
    validate: (value) => typeof value === 'string' && value.length > 0 && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRegex(re);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isURL')};`;
    },
  });
}

// UUID
const UUID_RE: Record<string | number, RegExp> = {
  all: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  1: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-1[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  2: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-2[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  3: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-3[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  4: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  5: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-5[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
};

export function isUUID(version?: 1 | 2 | 3 | 4 | 5 | 'all'): EmittableRule {
  const re = (version != null ? (UUID_RE[version] ?? UUID_RE.all) : UUID_RE.all)!;
  return makeStringRule(
    'isUUID',
    (v) => re.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(re);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isUUID')};`;
    },
    'string',
    { format: 'uuid', version },
  );
}

// IP
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/;
const IPV6_RE = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^::$|^::1$|^::(?:ffff(?::0{1,4})?:)?(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$|^(?:[0-9a-fA-F]{1,4}:){1,4}:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

export function isIP(version?: 4 | 6): EmittableRule {
  return makeRule({
    name: 'isIP',
    requiresType: 'string',
    constraints: { version },
    validate: (value) => {
      if (typeof value !== 'string') return false;
      if (version === 4) return IPV4_RE.test(value);
      if (version === 6) return IPV6_RE.test(value);
      return IPV4_RE.test(value) || IPV6_RE.test(value);
    },
    emit: (varName: string, ctx: EmitContext): string => {
      if (version === 4) {
        const i = ctx.addRegex(IPV4_RE);
        return `if (!_re[${i}].test(${varName})) ${ctx.fail('isIP')};`;
      }
      if (version === 6) {
        const i = ctx.addRegex(IPV6_RE);
        return `if (!_re[${i}].test(${varName})) ${ctx.fail('isIP')};`;
      }
      const i4 = ctx.addRegex(IPV4_RE);
      const i6 = ctx.addRegex(IPV6_RE);
      return `if (!_re[${i4}].test(${varName}) && !_re[${i6}].test(${varName})) ${ctx.fail('isIP')};`;
    },
  });
}

// HexColor: #RGB or #RRGGBB
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const isHexColor = makeStringRule(
  'isHexColor',
  (v) => HEX_COLOR_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(HEX_COLOR_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isHexColor')};`;
  },
);

// RgbColor
const RGB_RE = /^rgb\(\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*\)$/;
const RGBA_RE = /^rgba\(\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(0|0?\.\d+|1(\.0+)?)\s*\)$/;
const RGB_PERCENT_RE = /^rgba?\(\s*(\d{1,2}|100)%\s*,\s*(\d{1,2}|100)%\s*,\s*(\d{1,2}|100)%(?:\s*,\s*(0|0?\.\d+|1(?:\.0+)?))?\s*\)$/;

export function isRgbColor(includePercentValues: boolean = false): EmittableRule {
  return makeRule({
    name: 'isRgbColor',
    requiresType: 'string',
    constraints: { includePercentValues },
    validate: (value) => {
      if (typeof value !== 'string') return false;
      if (includePercentValues) return RGB_PERCENT_RE.test(value);
      return RGB_RE.test(value) || RGBA_RE.test(value);
    },
    emit: (varName: string, ctx: EmitContext): string => {
      if (includePercentValues) {
        const i = ctx.addRegex(RGB_PERCENT_RE);
        return `if (!_re[${i}].test(${varName})) ${ctx.fail('isRgbColor')};`;
      }
      const i1 = ctx.addRegex(RGB_RE);
      const i2 = ctx.addRegex(RGBA_RE);
      return `if (!_re[${i1}].test(${varName}) && !_re[${i2}].test(${varName})) ${ctx.fail('isRgbColor')};`;
    },
  });
}

// HSL: hsl(H, S%, L%) or hsla(H, S%, L%, A)
const HSL_RE = /^hsla?\(\s*(360|3[0-5]\d|[12]\d{2}|[1-9]\d|\d)\s*,\s*(100|[1-9]\d|\d)%\s*,\s*(100|[1-9]\d|\d)%(?:\s*,\s*(0|0?\.\d+|1(?:\.0+)?))?\s*\)$/;
export const isHSL = makeStringRule(
  'isHSL',
  (v) => HSL_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(HSL_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isHSL')};`;
  },
);

// MAC Address
export interface IsMACAddressOptions {
  no_separators?: boolean;
}

const MAC_COLON_RE = /^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}$/;
const MAC_HYPHEN_RE = /^[0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5}$/;
const MAC_NO_SEP_RE = /^[0-9a-fA-F]{12}$/;

export function isMACAddress(options?: IsMACAddressOptions): EmittableRule {
  return makeRule({
    name: 'isMACAddress',
    requiresType: 'string',
    constraints: { no_separators: options?.no_separators },
    validate: (value) => {
      if (typeof value !== 'string') return false;
      if (options?.no_separators) return MAC_NO_SEP_RE.test(value);
      return MAC_COLON_RE.test(value) || MAC_HYPHEN_RE.test(value);
    },
    emit: (varName: string, ctx: EmitContext): string => {
      if (options?.no_separators) {
        const i = ctx.addRegex(MAC_NO_SEP_RE);
        return `if (!_re[${i}].test(${varName})) ${ctx.fail('isMACAddress')};`;
      }
      const i1 = ctx.addRegex(MAC_COLON_RE);
      const i2 = ctx.addRegex(MAC_HYPHEN_RE);
      return `if (!_re[${i1}].test(${varName}) && !_re[${i2}].test(${varName})) ${ctx.fail('isMACAddress')};`;
    },
  });
}

// ISBN
function _validateISBN10(str: string): boolean {
  const s = str.replace(/[-\s]/g, '');
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * (s.charCodeAt(i) - 48);
  const last = s[9] === 'X' ? 10 : (s.charCodeAt(9) - 48);
  sum += last;
  return sum % 11 === 0;
}

function _validateISBN13(str: string): boolean {
  const s = str.replace(/[-\s]/g, '');
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += (s.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === (s.charCodeAt(12) - 48);
}

export function isISBN(version?: 10 | 13): EmittableRule {
  const validateFn = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    if (version === 10) return _validateISBN10(value);
    if (version === 13) return _validateISBN13(value);
    return _validateISBN10(value) || _validateISBN13(value);
  };

  const emitISBN10 = (v: string): string =>
    `{var _s=${v}.replace(/[-\\s]/g,'');` +
    `if(!/^\\d{9}[\\dX]$/.test(_s)){%%FAIL%%}` +
    `else{var _sm=0;for(var _i=0;_i<9;_i++)_sm+=(10-_i)*(_s.charCodeAt(_i)-48);` +
    `var _l=_s[9]==='X'?10:(_s.charCodeAt(9)-48);_sm+=_l;` +
    `if(_sm%11!==0){%%FAIL%%}}}`;

  const emitISBN13 = (v: string): string =>
    `{var _s=${v}.replace(/[-\\s]/g,'');` +
    `if(!/^\\d{13}$/.test(_s)){%%FAIL%%}` +
    `else{var _sm=0;for(var _i=0;_i<12;_i++)_sm+=(_s.charCodeAt(_i)-48)*(_i%2===0?1:3);` +
    `var _ck=(10-(_sm%10))%10;` +
    `if(_ck!==(_s.charCodeAt(12)-48)){%%FAIL%%}}}`;

  return makeRule({
    name: 'isISBN',
    requiresType: 'string',
    constraints: { version },
    validate: validateFn,
    emit: (varName: string, ctx: EmitContext): string => {
      const fail = ctx.fail('isISBN');
      if (version === 10) return emitISBN10(varName).replace(/%%FAIL%%/g, fail);
      if (version === 13) return emitISBN13(varName).replace(/%%FAIL%%/g, fail);
      const emit10 = emitISBN10(varName).replace(/%%FAIL%%/g, '__isbn_ok=false');
      const emit13 = emitISBN13(varName).replace(/%%FAIL%%/g, '__isbn_ok=false');
      return `{var __isbn_ok=true;${emit10} if(!__isbn_ok){__isbn_ok=true;${emit13}} if(!__isbn_ok)${fail};}`;
    },
  });
}

// ISIN — ISO 6166
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function _validateISINStr(v: string): boolean {
  if (!ISIN_RE.test(v)) return false;
  // Luhn mod10 on expanded digits
  const expanded = v
    .split('')
    .map((c) => {
      const code = c.charCodeAt(0);
      return code >= 65 ? String(code - 55) : c;
    })
    .join('');
  let sum = 0;
  let alternate = false;
  for (let i = expanded.length - 1; i >= 0; i--) {
    let n = parseInt(expanded[i]!, 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export const isISIN = makeStringRule(
  'isISIN',
  _validateISINStr,
  (varName, ctx) => {
    const i = ctx.addRegex(ISIN_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isISIN')};\n` +
      `else { var _isExp=${varName}.split('').map(function(c){var _cd=c.charCodeAt(0);return _cd>=65?String(_cd-55):c;}).join('');\n` +
      `var _isSum=0,_isAlt=false;for(var _isI=_isExp.length-1;_isI>=0;_isI--){var _isN=parseInt(_isExp[_isI],10);if(_isAlt){_isN*=2;if(_isN>9)_isN-=9;}_isSum+=_isN;_isAlt=!_isAlt;}\n` +
      `if(_isSum%10!==0)${ctx.fail('isISIN')}; }`;
  },
);

// ISO 8601
const ISO8601_RE = /^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)?)?$/;

export interface IsISO8601Options {
  strict?: boolean;
}

// Strict ISO8601: requires month/day to be valid values
function _validateISO8601Strict(v: string): boolean {
  if (!ISO8601_RE.test(v)) return false;
  // Extract date components if present
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return true; // year-only or year-month partial — still ok per regex
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  const maxDay = new Date(Number(m[1]), month, 0).getDate();
  return day >= 1 && day <= maxDay;
}

export function isISO8601(options?: IsISO8601Options): EmittableRule {
  if (options?.strict) {
    const validateStrict = (v: unknown): boolean => typeof v === 'string' && _validateISO8601Strict(v);
    return makeRule({
      name: 'isISO8601',
      requiresType: 'string',
      constraints: { format: 'date-time', strict: true },
      validate: validateStrict,
      emit: (varName: string, ctx: EmitContext): string => {
        const i = ctx.addRegex(ISO8601_RE);
        return `if (!_re[${i}].test(${varName})) ${ctx.fail('isISO8601')};\n` +
          `else { var _dm=${varName}.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);` +
          `if(_dm){var _mo=Number(_dm[2]),_da=Number(_dm[3]);` +
          `if(_mo<1||_mo>12){${ctx.fail('isISO8601')}}` +
          `else{var _md=new Date(Number(_dm[1]),_mo,0).getDate();` +
          `if(_da<1||_da>_md)${ctx.fail('isISO8601')};}} }`;
      },
    });
  }
  // non-strict: both validate and emit use same ISO8601_RE
  return makeStringRule(
    'isISO8601',
    (v) => ISO8601_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(ISO8601_RE);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isISO8601')};`;
    },
    'string',
    { format: 'date-time', strict: false },
  );
}

// ISRC — ISO 3901
const ISRC_RE = /^[A-Z]{2}-[A-Z0-9]{3}-\d{2}-\d{5}$|^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
export const isISRC = makeStringRule(
  'isISRC',
  (v) => ISRC_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ISRC_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isISRC')};`;
  },
);

// ISSN
export interface IsISSNOptions {
  requireHyphen?: boolean;
}

function _validateISSN(value: string, options?: IsISSNOptions): boolean {
  const requireHyphen = options?.requireHyphen !== false;
  const s = requireHyphen ? value : value.replace(/-/g, '');
  // Format with hyphen: NNNN-NNNX, without: NNNNNNXX
  const re = requireHyphen ? /^\d{4}-\d{3}[\dX]$/ : /^\d{7}[\dX]$/;
  if (!re.test(s)) return false;
  const digits = s.replace(/-/g, '');
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += (8 - i) * (digits.charCodeAt(i) - 48);
  }
  const last = digits[7] === 'X' ? 10 : (digits.charCodeAt(7) - 48);
  sum += last;
  return sum % 11 === 0;
}

export function isISSN(options?: IsISSNOptions): EmittableRule {
  const requireHyphen = options?.requireHyphen !== false;
  const validateIssn = (value: unknown): boolean =>
    typeof value === 'string' && _validateISSN(value, options);

  const formatRe = requireHyphen ? /^\d{4}-\d{3}[\dX]$/ : /^\d{7}[\dX]$/;

  return makeRule({
    name: 'isISSN',
    requiresType: 'string',
    constraints: { requireHyphen: options?.requireHyphen },
    validate: validateIssn,
    emit: (varName: string, ctx: EmitContext): string => {
      const ri = ctx.addRegex(formatRe);
      const strip = requireHyphen ? varName : `${varName}.replace(/-/g,'')`;
      return `{var _is=${strip};` +
        `if(!_re[${ri}].test(_is)){${ctx.fail('isISSN')}}` +
        `else{var _id=_is.replace(/-/g,''),_iss=0;` +
        `for(var _ii=0;_ii<7;_ii++)_iss+=(8-_ii)*(_id.charCodeAt(_ii)-48);` +
        `var _il=_id[7]==='X'?10:(_id.charCodeAt(7)-48);_iss+=_il;` +
        `if(_iss%11!==0)${ctx.fail('isISSN')};}}`;
    },
  });
}

// JWT — 3-part dot-separated base64url
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const isJWT = makeStringRule(
  'isJWT',
  (v) => JWT_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(JWT_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isJWT')};`;
  },
);

// LatLong
const LAT_LONG_RE = /^[-+]?([1-8]?\d(?:\.\d+)?|90(?:\.0+)?),\s*[-+]?(180(?:\.0+)?|1[0-7]\d(?:\.\d+)?|\d{1,2}(?:\.\d+)?)$/;

export function isLatLong(): EmittableRule {
  return makeStringRule(
    'isLatLong',
    (v) => LAT_LONG_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(LAT_LONG_RE);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isLatLong')};`;
    },
  );
}

// Locale — BCP 47 simplified
const LOCALE_RE = /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{4})?(?:-(?:[a-zA-Z]{2}|\d{3}))?(?:-[a-zA-Z\d]{5,8})*$/;
export const isLocale = makeStringRule(
  'isLocale',
  (v) => LOCALE_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(LOCALE_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isLocale')};`;
  },
);

// DataURI
const DATA_URI_RE = /^data:([a-zA-Z0-9!#$&\-^_]+\/[a-zA-Z0-9!#$&\-^_]+)(?:;[a-zA-Z0-9\-]+=[a-zA-Z0-9\-]+)*(?:;base64)?,[\s\S]*$/;
export const isDataURI = makeStringRule(
  'isDataURI',
  (v) => DATA_URI_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(DATA_URI_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isDataURI')};`;
  },
);

// FQDN
export interface IsFQDNOptions {
  require_tld?: boolean;
  allow_underscores?: boolean;
  allow_trailing_dot?: boolean;
}

export function isFQDN(options?: IsFQDNOptions): EmittableRule {
  const requireTld = options?.require_tld !== false;
  const allowUnderscores = options?.allow_underscores ?? false;
  const allowTrailingDot = options?.allow_trailing_dot ?? false;

  const partRe = allowUnderscores ? /^[a-zA-Z0-9_-]+$/ : /^[a-zA-Z0-9-]+$/;

  const validateFqdn = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    let str = value;
    if (allowTrailingDot && str.endsWith('.')) str = str.slice(0, -1);
    if (str.length === 0) return false;
    const parts = str.split('.');
    if (requireTld && parts.length < 2) return false;
    if (requireTld) {
      const tld = parts[parts.length - 1];
      if (!tld || tld.length < 2 || !/^[a-zA-Z]{2,}$/.test(tld)) return false;
    }
    return parts.every((part) => {
      if (part.length === 0 || part.length > 63) return false;
      if (!partRe.test(part)) return false;
      if (!allowUnderscores && (part.startsWith('-') || part.endsWith('-'))) return false;
      return true;
    });
  };

  return makeRule({
    name: 'isFQDN',
    requiresType: 'string',
    constraints: {
      require_tld: options?.require_tld,
      allow_underscores: options?.allow_underscores,
      allow_trailing_dot: options?.allow_trailing_dot,
    },
    validate: validateFqdn,
    emit: (varName: string, ctx: EmitContext): string => {
      const ri = ctx.addRegex(partRe);
      const tldRi = requireTld ? ctx.addRegex(/^[a-zA-Z]{2,}$/) : -1;
      let code = `{var _fq=${varName};`;
      if (allowTrailingDot) code += `if(_fq.endsWith('.'))_fq=_fq.slice(0,-1);`;
      code += `if(_fq.length===0)${ctx.fail('isFQDN')};`;
      code += `else{var _fp=_fq.split('.');`;
      if (requireTld) {
        code += `if(_fp.length<2)${ctx.fail('isFQDN')};`;
        code += `else{var _tld=_fp[_fp.length-1];`;
        code += `if(!_tld||_tld.length<2||!_re[${tldRi}].test(_tld))${ctx.fail('isFQDN')};`;
        code += `else if(!_fp.every(function(p){`;
      } else {
        code += `if(!_fp.every(function(p){`;
      }
      code += `if(p.length===0||p.length>63)return false;`;
      code += `if(!_re[${ri}].test(p))return false;`;
      if (!allowUnderscores) code += `if(p[0]==='-'||p[p.length-1]==='-')return false;`;
      code += `return true;}))${ctx.fail('isFQDN')};`;
      // close: requireTld adds else{ for tld block
      if (requireTld) code += '}'; // close tld else{
      code += '}'; // close split else{
      code += '}'; // close outer {
      return code;
    },
  });
}

// Port — 0 to 65535
const PORT_RE = /^(?:6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{1,3}|\d)$/;
export const isPort = makeStringRule(
  'isPort',
  (v) => PORT_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(PORT_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isPort')};`;
  },
);

// EAN (EAN-8 and EAN-13 with checksum)
function _validateEAN(value: string): boolean {
  if (!/^\d{8}$/.test(value) && !/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const len = digits.length;
  let sum = 0;
  for (let i = 0; i < len - 1; i++) {
    sum += digits[i]! * (len === 8 ? (i % 2 === 0 ? 3 : 1) : (i % 2 === 0 ? 1 : 3));
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits[len - 1]!;
}

export const isEAN = makeStringRule(
  'isEAN',
  _validateEAN,
  (varName, ctx) => {
    const re8 = ctx.addRegex(/^\d{8}$/);
    const re13 = ctx.addRegex(/^\d{13}$/);
    return `{var _ev=${varName};` +
      `if(!_re[${re8}].test(_ev)&&!_re[${re13}].test(_ev)){${ctx.fail('isEAN')}}` +
      `else{var _el=_ev.length,_es=0;` +
      `for(var _ei=0;_ei<_el-1;_ei++){var _ed=_ev.charCodeAt(_ei)-48;_es+=_ed*(_el===8?(_ei%2===0?3:1):(_ei%2===0?1:3));}` +
      `var _ec=(10-(_es%10))%10;` +
      `if(_ec!==(_ev.charCodeAt(_el-1)-48))${ctx.fail('isEAN')};}}`;
  },
);

// ISO 3166-1 Alpha-2
const ISO31661A2_CODES = new Set([
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
  'JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
  'QA','RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU',
  'WF','WS','YE','YT','ZA','ZM','ZW',
]);

export const isISO31661Alpha2 = makeRule({
  name: 'isISO31661Alpha2',
  requiresType: 'string',
  constraints: {},
  validate: (value) => typeof value === 'string' && ISO31661A2_CODES.has(value.toUpperCase()),
  emit: (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(ISO31661A2_CODES);
    return `if (!_refs[${i}].has(${varName}.toUpperCase())) ${ctx.fail('isISO31661Alpha2')};`;
  },
});

// ISO 3166-1 Alpha-3
const ISO31661A3_CODES = new Set([
  'ABW','AFG','AGO','AIA','ALA','ALB','AND','ANT','ARE','ARG','ARM','ASM','ATA','ATF','ATG','AUS','AUT','AZE',
  'BDI','BEL','BEN','BES','BFA','BGD','BGR','BHR','BHS','BIH','BLM','BLR','BLZ','BMU','BOL','BRA','BRB','BRN','BTN','BVT','BWA',
  'CAF','CAN','CCK','CHE','CHL','CHN','CIV','CMR','COD','COG','COK','COL','COM','CPV','CRI','CUB','CUW','CXR','CYM','CYP','CZE',
  'DEU','DJI','DMA','DNK','DOM','DZA','ECU','EGY','ERI','ESH','ESP','EST','ETH',
  'FIN','FJI','FLK','FRA','FRO','FSM','GAB','GBR','GEO','GGY','GHA','GIB','GIN','GLP','GMB','GNB','GNQ','GRC','GRD','GRL','GTM','GUF','GUM','GUY',
  'HKG','HMD','HND','HRV','HTI','HUN','IDN','IMN','IND','IOT','IRL','IRN','IRQ','ISL','ISR','ITA',
  'JAM','JEY','JOR','JPN','KAZ','KEN','KGZ','KHM','KIR','KNA','KOR','KWT',
  'LAO','LBN','LBR','LBY','LCA','LIE','LKA','LSO','LTU','LUX','LVA',
  'MAC','MAF','MAR','MCO','MDA','MDG','MDV','MEX','MHL','MKD','MLI','MLT','MMR','MNE','MNG','MNP','MOZ','MRT','MSR','MTQ','MUS','MWI','MYS','MYT',
  'NAM','NCL','NER','NFK','NGA','NIC','NIU','NLD','NOR','NPL','NRU','NZL',
  'OMN','PAK','PAN','PCN','PER','PHL','PLW','PNG','POL','PRI','PRK','PRT','PRY','PSE','PYF',
  'QAT','REU','ROU','RUS','RWA',
  'SAU','SDN','SEN','SGP','SGS','SHN','SJM','SLB','SLE','SLV','SMR','SOM','SPM','SRB','SSD','STP','SUR','SVK','SVN','SWE','SWZ','SXM','SYC','SYR',
  'TCA','TCD','TGO','THA','TJK','TKL','TKM','TLS','TON','TTO','TUN','TUR','TUV','TWN','TZA',
  'UGA','UKR','UMI','URY','USA','UZB','VAT','VCT','VEN','VGB','VIR','VNM','VUT',
  'WLF','WSM','YEM','ZAF','ZMB','ZWE',
]);

export const isISO31661Alpha3 = makeRule({
  name: 'isISO31661Alpha3',
  requiresType: 'string',
  constraints: {},
  validate: (value) => typeof value === 'string' && ISO31661A3_CODES.has(value.toUpperCase()),
  emit: (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(ISO31661A3_CODES);
    return `if (!_refs[${i}].has(${varName}.toUpperCase())) ${ctx.fail('isISO31661Alpha3')};`;
  },
});

// BIC / SWIFT code
const BIC_RE = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
export const isBIC = makeStringRule(
  'isBIC',
  (v) => BIC_RE.test(v.toUpperCase()),
  (varName, ctx) => {
    const i = ctx.addRegex(BIC_RE);
    return `if (!_re[${i}].test(${varName}.toUpperCase())) ${ctx.fail('isBIC')};`;
  },
);

// Firebase Push ID — 20 chars, base64url charset (-0-9A-Za-z_)
const FIREBASE_RE = /^[a-zA-Z0-9_-]{20}$/;
export const isFirebasePushId = makeStringRule(
  'isFirebasePushId',
  (v) => FIREBASE_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(FIREBASE_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isFirebasePushId')};`;
  },
);

// SemVer — Semantic Versioning 2.0
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
export const isSemVer = makeStringRule(
  'isSemVer',
  (v) => SEMVER_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(SEMVER_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isSemVer')};`;
  },
);

// MongoDB ObjectId — 24-char hex
const MONGO_ID_RE = /^[0-9a-fA-F]{24}$/;
export const isMongoId = makeStringRule(
  'isMongoId',
  (v) => MONGO_ID_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MONGO_ID_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isMongoId')};`;
  },
);

// JSON
const validateJsonString = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

export const isJSON = makeRule({
  name: 'isJSON',
  requiresType: 'string',
  constraints: {},
  validate: validateJsonString,
  emit: (varName: string, ctx: EmitContext): string =>
    `try { JSON.parse(${varName}); } catch(_e) { ${ctx.fail('isJSON')}; }`,
});

// Base32
const BASE32_RE = /^[A-Z2-7]+=*$/i;
export function isBase32(): EmittableRule {
  const re = BASE32_RE;
  return makeStringRule(
    'isBase32',
    (v) => {
      if (v.length === 0) return false;
      if (v.length % 8 !== 0) return false;
      return re.test(v);
    },
    (varName, ctx) => {
      const i = ctx.addRegex(re);
      return `if (${varName}.length === 0 || ${varName}.length % 8 !== 0 || !_re[${i}].test(${varName})) ${ctx.fail('isBase32')};`;
    },
  );
}

// Base58
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
export const isBase58 = makeStringRule(
  'isBase58',
  (v) => BASE58_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(BASE58_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isBase58')};`;
  },
);

// Base64
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
const BASE64_URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;

export interface IsBase64Options {
  urlSafe?: boolean;
}

export function isBase64(options?: IsBase64Options): EmittableRule {
  const re = options?.urlSafe ? BASE64_URL_RE : BASE64_RE;
  return makeStringRule(
    'isBase64',
    (v) => {
      if (v.length === 0) return false;
      return re.test(v);
    },
    (varName, ctx) => {
      const i = ctx.addRegex(re);
      return `if (${varName}.length === 0 || !_re[${i}].test(${varName})) ${ctx.fail('isBase64')};`;
    },
    'string',
    { urlSafe: options?.urlSafe },
  );
}

// DateString — ISO 8601 date only (YYYY-MM-DD)
const DATE_STRING_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export function isDateString(): EmittableRule {
  return makeStringRule(
    'isDateString',
    (v) => DATE_STRING_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(DATE_STRING_RE);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isDateString')};`;
    },
  );
}

// MimeType
const MIME_TYPE_RE = /^(application|audio|font|image|message|model|multipart|text|video)\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*(?:;.+)?$/;
export const isMimeType = makeStringRule(
  'isMimeType',
  (v) => MIME_TYPE_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MIME_TYPE_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isMimeType')};`;
  },
);

// Currency
const CURRENCY_RE = /^[-+]?(?:[,.\d]+)(?:[.,]\d{2})?$|^\$?-?(?:\d+|\d{1,3}(?:,\d{3})*)(?:\.\d{1,2})?$/;

export function isCurrency(): EmittableRule {
  return makeStringRule(
    'isCurrency',
    (v) => {
      if (v.length === 0) return false;
      return CURRENCY_RE.test(v);
    },
    (varName, ctx) => {
      const i = ctx.addRegex(CURRENCY_RE);
      return `if (${varName}.length === 0 || !_re[${i}].test(${varName})) ${ctx.fail('isCurrency')};`;
    },
  );
}

// Magnet URI
const MAGNET_URI_RE = /^magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,40}/i;
export const isMagnetURI = makeStringRule(
  'isMagnetURI',
  (v) => MAGNET_URI_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MAGNET_URI_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isMagnetURI')};`;
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Group D: Algorithm-based
// ─────────────────────────────────────────────────────────────────────────────

// Credit Card — Luhn algorithm (§4.8 C)
function _luhn(str: string): boolean {
  const s = str.replace(/[\s-]/g, '');
  if (s.length === 0 || !/^\d+$/.test(s)) return false;
  let sum = 0;
  let alternate = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = s.charCodeAt(i) - 48;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export const isCreditCard = makeRule({
  name: 'isCreditCard',
  requiresType: 'string',
  constraints: {},
  validate: (value) => typeof value === 'string' && _luhn(value),
  emit: (varName: string, ctx: EmitContext): string => `{
  var _cs=${varName}.replace(/[\\s-]/g,'');
  if(_cs.length===0||!/^\\d+$/.test(_cs)){${ctx.fail('isCreditCard')}}
  else{var _sum=0,_alt=false;
  for(var _ci=_cs.length-1;_ci>=0;_ci--){var _cn=_cs.charCodeAt(_ci)-48;if(_alt){_cn*=2;if(_cn>9)_cn-=9;}_sum+=_cn;_alt=!_alt;}
  if(_sum%10!==0)${ctx.fail('isCreditCard')};}
}`,
});

// IBAN — ISO 13616 mod-97
export interface IsIBANOptions {
  allowSpaces?: boolean;
}

const IBAN_COUNTRY_LENGTH: Record<string, number> = {
  'AD': 24, 'AE': 23, 'AL': 28, 'AT': 20, 'AZ': 28, 'BA': 20, 'BE': 16, 'BG': 22, 'BH': 22,
  'BR': 29, 'CH': 21, 'CR': 22, 'CY': 28, 'CZ': 24, 'DE': 22, 'DK': 18, 'DO': 28, 'EE': 20,
  'ES': 24, 'FI': 18, 'FO': 18, 'FR': 27, 'GB': 22, 'GE': 22, 'GI': 23, 'GL': 18, 'GR': 27,
  'GT': 28, 'HR': 21, 'HU': 28, 'IE': 22, 'IL': 23, 'IS': 26, 'IT': 27, 'JO': 30, 'KW': 30,
  'KZ': 20, 'LB': 28, 'LC': 32, 'LI': 21, 'LT': 20, 'LU': 20, 'LV': 21, 'MC': 27, 'MD': 24,
  'ME': 22, 'MK': 19, 'MR': 27, 'MT': 31, 'MU': 30, 'NL': 18, 'NO': 15, 'PK': 24, 'PL': 28,
  'PS': 29, 'PT': 25, 'QA': 29, 'RO': 24, 'RS': 22, 'SA': 24, 'SC': 31, 'SE': 24, 'SI': 19,
  'SK': 24, 'SM': 27, 'ST': 25, 'SV': 28, 'TL': 23, 'TN': 24, 'TR': 26, 'UA': 29, 'VA': 22,
  'VG': 24, 'XK': 20,
};

function _validateIBAN(value: string, options?: IsIBANOptions): boolean {
  let s = options?.allowSpaces ? value.replace(/\s/g, '') : value;
  s = s.toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const country = s.slice(0, 2);
  const expectedLength = IBAN_COUNTRY_LENGTH[country];
  if (expectedLength !== undefined && s.length !== expectedLength) return false;
  // Rearrange: move first 4 chars to end
  const rearranged = s.slice(4) + s.slice(0, 4);
  // Convert letters to digits (A=10, B=11, ...)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  // Compute mod 97 on large number in chunks
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(remainder) + numeric.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  return remainder === 1;
}

export function isIBAN(options?: IsIBANOptions): EmittableRule {
  const allowSpaces = options?.allowSpaces ?? false;
  const validateIban = (value: unknown): boolean =>
    typeof value === 'string' && _validateIBAN(value, options);
  return makeRule({
    name: 'isIBAN',
    requiresType: 'string',
    constraints: { allowSpaces: options?.allowSpaces },
    validate: validateIban,
    emit: (varName: string, ctx: EmitContext): string => {
      const baseRi = ctx.addRegex(/^[A-Z]{2}\d{2}[A-Z0-9]+$/);
      const tableIdx = ctx.addRef(IBAN_COUNTRY_LENGTH);
      let code = '{';
      code += `var _ib=${allowSpaces ? `${varName}.replace(/\\s/g,'')` : varName}.toUpperCase();`;
      code += `if(!_re[${baseRi}].test(_ib)){${ctx.fail('isIBAN')}}`;
      code += `else{var _ic=_ib.slice(0,2),_il=_refs[${tableIdx}][_ic];`;
      code += `if(_il!==undefined&&_ib.length!==_il){${ctx.fail('isIBAN')}}`;
      code += `else{var _ir=_ib.slice(4)+_ib.slice(0,4);`;
      code += `var _in=_ir.replace(/[A-Z]/g,function(c){return String(c.charCodeAt(0)-55);});`;
      code += `var _im=0;for(var _ii=0;_ii<_in.length;_ii+=7){_im=parseInt(String(_im)+_in.slice(_ii,_ii+7),10)%97;}`;
      code += `if(_im!==1)${ctx.fail('isIBAN')};}}}`;
      return code;
    },
  });
}

// ByteLength — counts UTF-8 bytes via Buffer.byteLength
export function isByteLength(min: number, max?: number): EmittableRule {
  const validateByteLength = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    const byteLen = Buffer.byteLength(value, 'utf8');
    if (byteLen < min) return false;
    if (max !== undefined && byteLen > max) return false;
    return true;
  };
  return makeRule({
    name: 'isByteLength',
    requiresType: 'string',
    constraints: { min, max },
    validate: validateByteLength,
    emit: (varName: string, ctx: EmitContext): string => {
      let code = `{var _bl=Buffer.byteLength(${varName},'utf8');`;
      code += `if(_bl<${min})${ctx.fail('isByteLength')};`;
      if (max !== undefined) code += `else if(_bl>${max})${ctx.fail('isByteLength')};`;
      code += '}';
      return code;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Group E: New Validators
// ─────────────────────────────────────────────────────────────────────────────

// isHash — per-algorithm hex regex (§4.8 B: regex inline)

const HASH_REGEXES: Record<string, RegExp> = {
  md5:        /^[a-f0-9]{32}$/i,
  md4:        /^[a-f0-9]{32}$/i,
  md2:        /^[a-f0-9]{32}$/i,
  sha1:       /^[a-f0-9]{40}$/i,
  sha256:     /^[a-f0-9]{64}$/i,
  sha384:     /^[a-f0-9]{96}$/i,
  sha512:     /^[a-f0-9]{128}$/i,
  ripemd128:  /^[a-f0-9]{32}$/i,
  ripemd160:  /^[a-f0-9]{40}$/i,
  'tiger128,3': /^[a-f0-9]{32}$/i,
  'tiger128,4': /^[a-f0-9]{32}$/i,
  'tiger160,3': /^[a-f0-9]{40}$/i,
  'tiger160,4': /^[a-f0-9]{40}$/i,
  'tiger192,3': /^[a-f0-9]{48}$/i,
  'tiger192,4': /^[a-f0-9]{48}$/i,
  crc32:      /^[a-f0-9]{8}$/i,
  crc32b:     /^[a-f0-9]{8}$/i,
};

export function isHash(algorithm: string): EmittableRule {
  const re = HASH_REGEXES[algorithm];
  return makeRule({
    name: 'isHash',
    requiresType: 'string',
    constraints: { algorithm },
    validate: (value) => typeof value === 'string' && !!re && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      if (!re) return ctx.fail('isHash') + ';';
      const i = ctx.addRegex(re);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isHash')};`;
    },
  });
}

// isRFC3339 — RFC 3339 datetime (§4.8 B)

const RFC3339_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

export const isRFC3339 = makeStringRule(
  'isRFC3339',
  (v) => RFC3339_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(RFC3339_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isRFC3339')};`;
  },
);

// isMilitaryTime — HH:MM 24-hour format (§4.8 B)

const MILITARY_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isMilitaryTime = makeStringRule(
  'isMilitaryTime',
  (v) => MILITARY_TIME_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MILITARY_TIME_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isMilitaryTime')};`;
  },
);

// isLatitude — string or number, -90 to 90 (requiresType none)

function _checkLatitude(value: unknown): boolean {
  if (typeof value === 'number') {
    return value >= -90 && value <= 90;
  }
  if (typeof value === 'string') {
    const n = parseFloat(value);
    if (isNaN(n)) return false;
    if (String(n) !== value && value !== String(n)) {
      // extra chars check — parseFloat('90abc') = 90 but should fail
      if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
    }
    return n >= -90 && n <= 90;
  }
  return false;
}

export const isLatitude = makeRule({
  name: 'isLatitude',
  constraints: {},
  validate: _checkLatitude,
  emit: (varName: string, ctx: EmitContext): string => {
    const ri = ctx.addRegex(/^-?\d+(\.\d+)?$/);
    return `if(typeof ${varName}==='number'){if(${varName}<-90||${varName}>90)${ctx.fail('isLatitude')};}` +
      `else if(typeof ${varName}==='string'){var _lt=parseFloat(${varName});` +
      `if(isNaN(_lt)||!_re[${ri}].test(${varName})||_lt<-90||_lt>90)${ctx.fail('isLatitude')};}` +
      `else{${ctx.fail('isLatitude')};}`;
  },
});

// isLongitude — string or number, -180 to 180 (requiresType none)

function _checkLongitude(value: unknown): boolean {
  if (typeof value === 'number') {
    return value >= -180 && value <= 180;
  }
  if (typeof value === 'string') {
    const n = parseFloat(value);
    if (isNaN(n)) return false;
    if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
    return n >= -180 && n <= 180;
  }
  return false;
}

export const isLongitude = makeRule({
  name: 'isLongitude',
  constraints: {},
  validate: _checkLongitude,
  emit: (varName: string, ctx: EmitContext): string => {
    const ri = ctx.addRegex(/^-?\d+(\.\d+)?$/);
    return `if(typeof ${varName}==='number'){if(${varName}<-180||${varName}>180)${ctx.fail('isLongitude')};}` +
      `else if(typeof ${varName}==='string'){var _ln=parseFloat(${varName});` +
      `if(isNaN(_ln)||!_re[${ri}].test(${varName})||_ln<-180||_ln>180)${ctx.fail('isLongitude')};}` +
      `else{${ctx.fail('isLongitude')};}`;
  },
});

// isEthereumAddress — 0x + 40 hex chars (§4.8 B)

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const isEthereumAddress = makeStringRule(
  'isEthereumAddress',
  (v) => ETH_ADDRESS_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ETH_ADDRESS_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isEthereumAddress')};`;
  },
);

// isBtcAddress — P2PKH (1...), P2SH (3...), bech32 (bc1...) (§4.8 B)

const BTC_P2PKH_RE = /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const BTC_P2SH_RE  = /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const BTC_BECH32_RE = /^(bc1)[a-z0-9]{6,87}$/;

export const isBtcAddress = makeStringRule(
  'isBtcAddress',
  (v) => BTC_P2PKH_RE.test(v) || BTC_P2SH_RE.test(v) || BTC_BECH32_RE.test(v),
  (varName, ctx) => {
    const i1 = ctx.addRegex(BTC_P2PKH_RE);
    const i2 = ctx.addRegex(BTC_P2SH_RE);
    const i3 = ctx.addRegex(BTC_BECH32_RE);
    return `if (!_re[${i1}].test(${varName}) && !_re[${i2}].test(${varName}) && !_re[${i3}].test(${varName})) ${ctx.fail('isBtcAddress')};`;
  },
);

// isISO4217CurrencyCode — ISO 4217 currency code set (§4.8 C: ref-based)

const ISO4217_CODES = new Set([
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN',
  'BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BOV',
  'BRL','BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHE','CHF',
  'CHW','CLF','CLP','CNY','COP','COU','CRC','CUC','CUP','CVE',
  'CZK','DJF','DKK','DOP','DZD','EGP','ERN','ETB','EUR','FJD',
  'FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD',
  'HNL','HRK','HTG','HUF','IDR','ILS','INR','IQD','IRR','ISK',
  'JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD',
  'KYD','KZT','LAK','LBP','LKR','LRD','LSL','LYD','MAD','MDL',
  'MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN',
  'MXV','MYR','MZN','NAD','NGN','NIO','NOK','NPR','NZD','OMR',
  'PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD',
  'RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD','SHP','SLE',
  'SLL','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS',
  'TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX','USD',
  'USN','UYI','UYU','UYW','UZS','VED','VES','VND','VUV','WST',
  'XAF','XAG','XAU','XBA','XBB','XBC','XBD','XCD','XDR','XOF',
  'XPD','XPF','XPT','XSU','XTS','XUA','YER','ZAR','ZMW','ZWL',
]);

export const isISO4217CurrencyCode = makeStringRule(
  'isISO4217CurrencyCode',
  (v) => ISO4217_CODES.has(v),
  (varName, ctx) => {
    const i = ctx.addRef(ISO4217_CODES);
    return `if (!_refs[${i}].has(${varName})) ${ctx.fail('isISO4217CurrencyCode')};`;
  },
);

// isPhoneNumber — E.164 international phone number (§4.8 B)

const PHONE_E164_RE = /^\+[1-9]\d{6,14}$/;

export const isPhoneNumber = makeStringRule(
  'isPhoneNumber',
  (v) => PHONE_E164_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(PHONE_E164_RE);
    return `if (!_re[${i}].test(${varName})) ${ctx.fail('isPhoneNumber')};`;
  },
);

// isStrongPassword — strong password check (§4.8 C: factory)

export interface IsStrongPasswordOptions {
  minLength?: number;
  minLowercase?: number;
  minUppercase?: number;
  minNumbers?: number;
  minSymbols?: number;
}

export function isStrongPassword(options?: IsStrongPasswordOptions): EmittableRule {
  const minLength   = options?.minLength   ?? 8;
  const minLower    = options?.minLowercase ?? 1;
  const minUpper    = options?.minUppercase ?? 1;
  const minNums     = options?.minNumbers   ?? 1;
  const minSymbols  = options?.minSymbols   ?? 1;

  const validate = (v: string): boolean => {
    if (v.length < minLength) return false;
    if (minLower > 0) {
      const cnt = (v.match(/[a-z]/g) || []).length;
      if (cnt < minLower) return false;
    }
    if (minUpper > 0) {
      const cnt = (v.match(/[A-Z]/g) || []).length;
      if (cnt < minUpper) return false;
    }
    if (minNums > 0) {
      const cnt = (v.match(/[0-9]/g) || []).length;
      if (cnt < minNums) return false;
    }
    if (minSymbols > 0) {
      const cnt = (v.match(/[^a-zA-Z0-9]/g) || []).length;
      if (cnt < minSymbols) return false;
    }
    return true;
  };

  return makeRule({
    name: 'isStrongPassword',
    requiresType: 'string',
    constraints: {},
    validate: (value) => typeof value === 'string' && validate(value),
    emit: (varName: string, ctx: EmitContext): string => {
      let code = '';
      code += `if(${varName}.length<${minLength})${ctx.fail('isStrongPassword')};`;
      if (minLower > 0) code += `\nelse if((${varName}.match(/[a-z]/g)||[]).length<${minLower})${ctx.fail('isStrongPassword')};`;
      if (minUpper > 0) code += `\nelse if((${varName}.match(/[A-Z]/g)||[]).length<${minUpper})${ctx.fail('isStrongPassword')};`;
      if (minNums > 0) code += `\nelse if((${varName}.match(/[0-9]/g)||[]).length<${minNums})${ctx.fail('isStrongPassword')};`;
      if (minSymbols > 0) code += `\nelse if((${varName}.match(/[^a-zA-Z0-9]/g)||[]).length<${minSymbols})${ctx.fail('isStrongPassword')};`;
      return code;
    },
  });
}

// isTaxId — locale-specific tax identifier (§4.8 C: factory)

const TAX_ID_REGEXES: Record<string, RegExp> = {
  US: /^\d{2}-\d{7}$/,                      // EIN format: XX-XXXXXXX
  KR: /^\d{3}-\d{2}-\d{5}$/,                // Business Registration Number: XXX-XX-XXXXX
  DE: /^\d{11}$/,                            // Steuernummer: 11 digits
  FR: /^[0-9]{13}$/,                         // SIRET: 13 digits
  GB: /^\d{10}$/,                            // UTR: 10 digits
  IT: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i, // Codice Fiscale
  ES: /^[0-9A-Z]\d{7}[0-9A-Z]$/i,           // NIF/NIE/CIF
  AU: /^\d{11}$/,                            // ABN: 11 digits
  CA: /^\d{9}$/,                             // BN: 9 digits
  IN: /^[A-Z]{5}\d{4}[A-Z]$/i,              // PAN: XXXXX9999X
};

export function isTaxId(locale: string): EmittableRule {
  const re = TAX_ID_REGEXES[locale];
  return makeRule({
    name: 'isTaxId',
    requiresType: 'string',
    constraints: { locale },
    validate: (value) => typeof value === 'string' && !!re && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      if (!re) return ctx.fail('isTaxId') + ';';
      const i = ctx.addRegex(re);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isTaxId')};`;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ULID
// ─────────────────────────────────────────────────────────────────────────────

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isULID(): EmittableRule {
  return makeStringRule(
    'isULID',
    (v) => ULID_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(ULID_RE);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isULID')};`;
    },
    'string',
    { format: 'ulid' },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUID2
// ─────────────────────────────────────────────────────────────────────────────

const CUID2_RE = /^[a-z][0-9a-z]{23,}$/;

export function isCUID2(): EmittableRule {
  return makeStringRule(
    'isCUID2',
    (v) => CUID2_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(CUID2_RE);
      return `if (!_re[${i}].test(${varName})) ${ctx.fail('isCUID2')};`;
    },
    'string',
    { format: 'cuid2' },
  );
}
