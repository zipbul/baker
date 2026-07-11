import type { EmitContext, EmittableRule } from './interfaces';

import { RequiredType } from './enums';
import { makeRule } from './rule-plan';
import { makeStringRule } from './string-shared';

// Hexadecimal
const HEX_RE = /^[0-9a-fA-F]+$/;
const isHexadecimal = makeStringRule(
  'isHexadecimal',
  v => HEX_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(HEX_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isHexadecimal')};`;
  },
);

// Octal
const OCTAL_RE = /^(0[oO])?[0-7]+$/;
const isOctal = makeStringRule(
  'isOctal',
  v => OCTAL_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(OCTAL_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isOctal')};`;
  },
);

// HexColor: #RGB or #RRGGBB
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const isHexColor = makeStringRule(
  'isHexColor',
  v => HEX_COLOR_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(HEX_COLOR_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isHexColor')};`;
  },
);

// RgbColor
const RGB_RE =
  /^rgb\(\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*\)$/;
const RGBA_RE =
  /^rgba\(\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\s*,\s*(0|0?\.\d+|1(\.0+)?)\s*\)$/;
// Percent forms: rgb(...) must NOT have alpha; rgba(...) MUST have alpha.
const RGB_PERCENT_NOALPHA_RE = /^rgb\(\s*(\d{1,2}|100)%\s*,\s*(\d{1,2}|100)%\s*,\s*(\d{1,2}|100)%\s*\)$/;
const RGBA_PERCENT_RE = /^rgba\(\s*(\d{1,2}|100)%\s*,\s*(\d{1,2}|100)%\s*,\s*(\d{1,2}|100)%\s*,\s*(0|0?\.\d+|1(?:\.0+)?)\s*\)$/;

function isRgbColor(includePercentValues: boolean = false): EmittableRule<string> {
  return makeRule<string>({
    name: 'isRgbColor',
    requiresType: RequiredType.String,
    constraints: { includePercentValues },
    validate: value => {
      if (typeof value !== 'string') {
        return false;
      }
      if (includePercentValues) {
        return RGB_PERCENT_NOALPHA_RE.test(value) || RGBA_PERCENT_RE.test(value) || RGB_RE.test(value) || RGBA_RE.test(value);
      }
      return RGB_RE.test(value) || RGBA_RE.test(value);
    },
    emit: (varName: string, ctx: EmitContext): string => {
      if (includePercentValues) {
        const ip1 = ctx.addRegex(RGB_PERCENT_NOALPHA_RE);
        const ip2 = ctx.addRegex(RGBA_PERCENT_RE);
        const ip3 = ctx.addRegex(RGB_RE);
        const ip4 = ctx.addRegex(RGBA_RE);
        return `if (!re[${ip1}].test(${varName}) && !re[${ip2}].test(${varName}) && !re[${ip3}].test(${varName}) && !re[${ip4}].test(${varName})) ${ctx.fail('isRgbColor')};`;
      }
      const i1 = ctx.addRegex(RGB_RE);
      const i2 = ctx.addRegex(RGBA_RE);
      return `if (!re[${i1}].test(${varName}) && !re[${i2}].test(${varName})) ${ctx.fail('isRgbColor')};`;
    },
  });
}

// HSL: hsl(H, S%, L%) or hsla(H, S%, L%, A)
// Alpha belongs to hsla() only — `hsla?(...)?` previously let hsl() carry alpha and hsla() omit it.
const HSL_RE =
  /^(?:hsl\(\s*(?:360|3[0-5]\d|[12]\d{2}|[1-9]\d|\d)\s*,\s*(?:100|[1-9]\d|\d)%\s*,\s*(?:100|[1-9]\d|\d)%\s*\)|hsla\(\s*(?:360|3[0-5]\d|[12]\d{2}|[1-9]\d|\d)\s*,\s*(?:100|[1-9]\d|\d)%\s*,\s*(?:100|[1-9]\d|\d)%\s*,\s*(?:0|0?\.\d+|1(?:\.0+)?)\s*\))$/;
const isHSL = makeStringRule(
  'isHSL',
  v => HSL_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(HSL_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isHSL')};`;
  },
);

// Base32
const BASE32_RE = /^[A-Z2-7]+=*$/i;
// Empty-string fails the `+`-quantified regex anyway, so the explicit length===0 check is dead.
function isBase32(): EmittableRule<string> {
  return makeStringRule(
    'isBase32',
    v => v.length % 8 === 0 && BASE32_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(BASE32_RE);
      return `if (${varName}.length % 8 !== 0 || !re[${i}].test(${varName})) ${ctx.fail('isBase32')};`;
    },
  );
}

// Base58
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const isBase58 = makeStringRule(
  'isBase58',
  v => BASE58_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(BASE58_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isBase58')};`;
  },
);

// Base64
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
// URL-safe Base64 (RFC 4648 §5): `-_` alphabet, padding optional — but the length must still form
// valid 4-char blocks (a lone trailing char is not valid Base64), mirroring the strict BASE64_RE.
const BASE64_URL_RE = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}(?:==)?|[A-Za-z0-9_-]{3}=?|[A-Za-z0-9_-]{4})$/;

interface IsBase64Options {
  urlSafe?: boolean;
}

function isBase64(options?: IsBase64Options): EmittableRule<string> {
  const re = options?.urlSafe ? BASE64_URL_RE : BASE64_RE;
  // Empty-string check is redundant — both base64 regexes require ≥1 char and fail on empty input.
  return makeStringRule(
    'isBase64',
    v => re.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isBase64')};`;
    },
    RequiredType.String,
    options?.urlSafe !== undefined ? { urlSafe: options.urlSafe } : {},
  );
}

export { isHexadecimal, isOctal, isHexColor, isRgbColor, isHSL, isBase32, isBase58, isBase64 };
export type { IsBase64Options };
