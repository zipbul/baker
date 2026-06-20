import type { EmitContext, EmittableRule } from './types';

import { RequiredType } from './enums';
import { makeRule } from './rule-plan';
import { makeStringRule } from './string-shared';

// ISBN
function validateISBN10(str: string): boolean {
  const s = str.replace(/[-\s]/g, '');
  if (!/^\d{9}[\dX]$/.test(s)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * (s.charCodeAt(i) - 48);
  }
  const last = s[9] === 'X' ? 10 : s.charCodeAt(9) - 48;
  sum += last;
  return sum % 11 === 0;
}

function validateISBN13(str: string): boolean {
  const s = str.replace(/[-\s]/g, '');
  if (!/^\d{13}$/.test(s)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += (s.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === s.charCodeAt(12) - 48;
}

function isISBN(version?: 10 | 13): EmittableRule {
  const validateFn = (value: unknown): boolean => {
    if (typeof value !== 'string') {
      return false;
    }
    if (version === 10) {
      return validateISBN10(value);
    }
    if (version === 13) {
      return validateISBN13(value);
    }
    return validateISBN10(value) || validateISBN13(value);
  };

  const emitISBN10 = (v: string): string =>
    `{var s=${v}.replace(/[-\\s]/g,'');` +
    `if(!/^\\d{9}[\\dX]$/.test(s)){%%FAIL%%}` +
    `else{var sm=0;for(var i=0;i<9;i++)sm+=(10-i)*(s.charCodeAt(i)-48);` +
    `var l=s[9]==='X'?10:(s.charCodeAt(9)-48);sm+=l;` +
    `if(sm%11!==0){%%FAIL%%}}}`;

  const emitISBN13 = (v: string): string =>
    `{var s=${v}.replace(/[-\\s]/g,'');` +
    `if(!/^\\d{13}$/.test(s)){%%FAIL%%}` +
    `else{var sm=0;for(var i=0;i<12;i++)sm+=(s.charCodeAt(i)-48)*(i%2===0?1:3);` +
    `var ck=(10-(sm%10))%10;` +
    `if(ck!==(s.charCodeAt(12)-48)){%%FAIL%%}}}`;

  return makeRule({
    name: 'isISBN',
    requiresType: RequiredType.String,
    constraints: { version },
    validate: validateFn,
    emit: (varName: string, ctx: EmitContext): string => {
      const fail = ctx.fail('isISBN');
      if (version === 10) {
        return emitISBN10(varName).replace(/%%FAIL%%/g, fail);
      }
      if (version === 13) {
        return emitISBN13(varName).replace(/%%FAIL%%/g, fail);
      }
      const emit10 = emitISBN10(varName).replace(/%%FAIL%%/g, '__isbn_ok=false');
      const emit13 = emitISBN13(varName).replace(/%%FAIL%%/g, '__isbn_ok=false');
      return `{var __isbn_ok=true;${emit10} if(!__isbn_ok){__isbn_ok=true;${emit13}} if(!__isbn_ok)${fail};}`;
    },
  });
}

// ISIN — ISO 6166
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function validateISINStr(v: string): boolean {
  if (!ISIN_RE.test(v)) {
    return false;
  }
  // Luhn mod10 on expanded digits — walk right-to-left, expanding letters as A=10..Z=35 on the fly.
  // No intermediate string/array allocations.
  let sum = 0;
  let alternate = false;
  for (let i = v.length - 1; i >= 0; i--) {
    const code = v.charCodeAt(i);
    if (code <= 57) {
      // ASCII digit '0'..'9'
      let n = code - 48;
      if (alternate) {
        n *= 2;
        if (n > 9) {
          n -= 9;
        }
      }
      sum += n;
      alternate = !alternate;
    } else {
      // ASCII letter 'A'..'Z' → two-digit value, ones first when walking right-to-left
      const value = code - 55;
      const ones = value % 10;
      let n = ones;
      if (alternate) {
        n *= 2;
        if (n > 9) {
          n -= 9;
        }
      }
      sum += n;
      alternate = !alternate;
      n = (value - ones) / 10;
      if (alternate) {
        n *= 2;
        if (n > 9) {
          n -= 9;
        }
      }
      sum += n;
      alternate = !alternate;
    }
  }
  return sum % 10 === 0;
}

const isISIN = makeStringRule('isISIN', validateISINStr, (varName, ctx) => {
  const i = ctx.addRegex(ISIN_RE);
  return (
    `if (!re[${i}].test(${varName})) ${ctx.fail('isISIN')};\n` +
    `else { var isSum=0,isAlt=false;\n` +
    `for(var isI=${varName}.length-1;isI>=0;isI--){var isCd=${varName}.charCodeAt(isI);` +
    `if(isCd<=57){var isN=isCd-48;if(isAlt){isN*=2;if(isN>9)isN-=9;}isSum+=isN;isAlt=!isAlt;}` +
    `else{var isVal=isCd-55;var isO=isVal%10;var isN=isO;if(isAlt){isN*=2;if(isN>9)isN-=9;}isSum+=isN;isAlt=!isAlt;` +
    `isN=(isVal-isO)/10;if(isAlt){isN*=2;if(isN>9)isN-=9;}isSum+=isN;isAlt=!isAlt;}}\n` +
    `if(isSum%10!==0)${ctx.fail('isISIN')}; }`
  );
});

// ISSN
interface IsISSNOptions {
  requireHyphen?: boolean;
}

function validateISSN(value: string, options?: IsISSNOptions): boolean {
  const requireHyphen = options?.requireHyphen !== false;
  const s = requireHyphen ? value : value.replace(/-/g, '');
  // Format with hyphen: NNNN-NNNX, without: NNNNNNXX
  const re = requireHyphen ? /^\d{4}-\d{3}[\dX]$/ : /^\d{7}[\dX]$/;
  if (!re.test(s)) {
    return false;
  }
  const digits = s.replace(/-/g, '');
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += (8 - i) * (digits.charCodeAt(i) - 48);
  }
  const last = digits[7] === 'X' ? 10 : digits.charCodeAt(7) - 48;
  sum += last;
  return sum % 11 === 0;
}

function isISSN(options?: IsISSNOptions): EmittableRule {
  const requireHyphen = options?.requireHyphen !== false;
  const validateIssn = (value: unknown): boolean => typeof value === 'string' && validateISSN(value, options);

  const formatRe = requireHyphen ? /^\d{4}-\d{3}[\dX]$/ : /^\d{7}[\dX]$/;

  return makeRule({
    name: 'isISSN',
    requiresType: RequiredType.String,
    constraints: { requireHyphen: options?.requireHyphen },
    validate: validateIssn,
    emit: (varName: string, ctx: EmitContext): string => {
      const ri = ctx.addRegex(formatRe);
      const strip = requireHyphen ? varName : `${varName}.replace(/-/g,'')`;
      return (
        `{var issn=${strip};` +
        `if(!re[${ri}].test(issn)){${ctx.fail('isISSN')}}` +
        `else{var id=issn.replace(/-/g,''),iss=0;` +
        `for(var ii=0;ii<7;ii++)iss+=(8-ii)*(id.charCodeAt(ii)-48);` +
        `var il=id[7]==='X'?10:(id.charCodeAt(7)-48);iss+=il;` +
        `if(iss%11!==0)${ctx.fail('isISSN')};}}`
      );
    },
  });
}

// EAN (EAN-8 and EAN-13 with checksum)
function validateEAN(value: string): boolean {
  if (!/^\d{8}$/.test(value) && !/^\d{13}$/.test(value)) {
    return false;
  }
  // Walk via charCodeAt — no split/map array allocations
  const len = value.length;
  let sum = 0;
  for (let i = 0; i < len - 1; i++) {
    const d = value.charCodeAt(i) - 48;
    sum += d * (len === 8 ? (i % 2 === 0 ? 3 : 1) : i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === value.charCodeAt(len - 1) - 48;
}

const isEAN = makeStringRule('isEAN', validateEAN, (varName, ctx) => {
  const re8 = ctx.addRegex(/^\d{8}$/);
  const re13 = ctx.addRegex(/^\d{13}$/);
  return (
    `{var ev=${varName};` +
    `if(!re[${re8}].test(ev)&&!re[${re13}].test(ev)){${ctx.fail('isEAN')}}` +
    `else{var el=ev.length,es=0;` +
    `for(var ei=0;ei<el-1;ei++){var ed=ev.charCodeAt(ei)-48;es+=ed*(el===8?(ei%2===0?3:1):(ei%2===0?1:3));}` +
    `var ec=(10-(es%10))%10;` +
    `if(ec!==(ev.charCodeAt(el-1)-48))${ctx.fail('isEAN')};}}`
  );
});

// BIC / SWIFT code — case-insensitive via /i flag avoids per-call .toUpperCase() string allocation
const BIC_RE = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/i;
const isBIC = makeStringRule(
  'isBIC',
  v => BIC_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(BIC_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isBIC')};`;
  },
);

// Currency
// A single optional sign, either before the `$` (`-$5`, `+5`) or after it (`$-5`, `$+5`) — never
// both. The previous `[-+]?\$?-?` allowed two signs (e.g. `+-5`, `-$-5`).
const CURRENCY_RE = /^(?:[-+]?\$?|\$[-+]?)(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

function isCurrency(): EmittableRule {
  // Currency regex requires at least one digit; empty input fails the regex by itself.
  return makeStringRule(
    'isCurrency',
    v => CURRENCY_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(CURRENCY_RE);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isCurrency')};`;
    },
  );
}

// Credit Card — Luhn algorithm (§4.8 C)
function luhn(str: string): boolean {
  const s = str.replace(/[\s-]/g, '');
  if (s.length === 0 || !/^\d+$/.test(s)) {
    return false;
  }
  let sum = 0;
  let alternate = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = s.charCodeAt(i) - 48;
    if (alternate) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

const isCreditCard = makeRule({
  name: 'isCreditCard',
  requiresType: RequiredType.String,
  constraints: {},
  validate: value => typeof value === 'string' && luhn(value),
  emit: (varName: string, ctx: EmitContext): string => `{
  var cs=${varName}.replace(/[\\s-]/g,'');
  if(cs.length===0||!/^\\d+$/.test(cs)){${ctx.fail('isCreditCard')}}
  else{var sum=0,alt=false;
  for(var ci=cs.length-1;ci>=0;ci--){var cn=cs.charCodeAt(ci)-48;if(alt){cn*=2;if(cn>9)cn-=9;}sum+=cn;alt=!alt;}
  if(sum%10!==0)${ctx.fail('isCreditCard')};}
}`,
});

// IBAN — ISO 13616 mod-97
interface IsIBANOptions {
  allowSpaces?: boolean;
}

const IBAN_COUNTRY_LENGTH: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BR: 29,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  ES: 24,
  FI: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MR: 27,
  MT: 31,
  MU: 30,
  NL: 18,
  NO: 15,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  SA: 24,
  SC: 31,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
};

function validateIBAN(value: string, options?: IsIBANOptions): boolean {
  let s = options?.allowSpaces ? value.replace(/\s/g, '') : value;
  s = s.toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) {
    return false;
  }
  const country = s.slice(0, 2);
  const expectedLength = IBAN_COUNTRY_LENGTH[country];
  if (expectedLength !== undefined && s.length !== expectedLength) {
    return false;
  }
  // Rearrange: move first 4 chars to end
  const rearranged = s.slice(4) + s.slice(0, 4);
  // Walk char-by-char accumulating mod 97 — no .replace/closure, no String() coercion,
  // no parseInt() allocations.
  let remainder = 0;
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code <= 57) {
      // digit
      remainder = (remainder * 10 + (code - 48)) % 97;
    } else {
      // letter A-Z → two digits (value = code - 55)
      const value = code - 55;
      remainder = (remainder * 100 + value) % 97;
    }
  }
  return remainder === 1;
}

function isIBAN(options?: IsIBANOptions): EmittableRule {
  const allowSpaces = options?.allowSpaces ?? false;
  const validateIban = (value: unknown): boolean => typeof value === 'string' && validateIBAN(value, options);
  return makeRule({
    name: 'isIBAN',
    requiresType: RequiredType.String,
    constraints: { allowSpaces: options?.allowSpaces },
    validate: validateIban,
    emit: (varName: string, ctx: EmitContext): string => {
      const baseRi = ctx.addRegex(/^[A-Z]{2}\d{2}[A-Z0-9]+$/);
      const tableIdx = ctx.addRef(IBAN_COUNTRY_LENGTH);
      let code = '{';
      code += `var ib=${allowSpaces ? `${varName}.replace(/\\s/g,'')` : varName}.toUpperCase();`;
      code += `if(!re[${baseRi}].test(ib)){${ctx.fail('isIBAN')}}`;
      code += `else{var ic=ib.slice(0,2),il=refs[${tableIdx}][ic];`;
      code += `if(il!==undefined&&ib.length!==il){${ctx.fail('isIBAN')}}`;
      code += `else{var ir=ib.slice(4)+ib.slice(0,4);`;
      // Walk char-by-char for mod 97 — no .replace closure, no parseInt allocation
      code += `var im=0;for(var ii=0;ii<ir.length;ii++){var cc=ir.charCodeAt(ii);`;
      code += `if(cc<=57){im=(im*10+(cc-48))%97;}else{im=(im*100+(cc-55))%97;}}`;
      code += `if(im!==1)${ctx.fail('isIBAN')};}}}`;
      return code;
    },
  });
}

// isISO4217CurrencyCode — ISO 4217 currency code set (§4.8 C: ref-based)

const ISO4217_CODES = new Set([
  'AED',
  'AFN',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BGN',
  'BHD',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BOV',
  'BRL',
  'BSD',
  'BTN',
  'BWP',
  'BYN',
  'BZD',
  'CAD',
  'CDF',
  'CHE',
  'CHF',
  'CHW',
  'CLF',
  'CLP',
  'CNY',
  'COP',
  'COU',
  'CRC',
  'CUC',
  'CUP',
  'CVE',
  'CZK',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ERN',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GHS',
  'GIP',
  'GMD',
  'GNF',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HRK',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'IQD',
  'IRR',
  'ISK',
  'JMD',
  'JOD',
  'JPY',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KPW',
  'KRW',
  'KWD',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'LYD',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MMK',
  'MNT',
  'MOP',
  'MRU',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MXV',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'OMR',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RON',
  'RSD',
  'RUB',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SDG',
  'SEK',
  'SGD',
  'SHP',
  'SLE',
  'SLL',
  'SOS',
  'SRD',
  'SSP',
  'STN',
  'SVC',
  'SYP',
  'SZL',
  'THB',
  'TJS',
  'TMT',
  'TND',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'UGX',
  'USD',
  'USN',
  'UYI',
  'UYU',
  'UYW',
  'UZS',
  'VED',
  'VES',
  'VND',
  'VUV',
  'WST',
  'XAF',
  'XAG',
  'XAU',
  'XBA',
  'XBB',
  'XBC',
  'XBD',
  'XCD',
  'XDR',
  'XOF',
  'XPD',
  'XPF',
  'XPT',
  'XSU',
  'XTS',
  'XUA',
  'YER',
  'ZAR',
  'ZMW',
  'ZWL',
]);

const isISO4217CurrencyCode = makeStringRule(
  'isISO4217CurrencyCode',
  v => ISO4217_CODES.has(v),
  (varName, ctx) => {
    const i = ctx.addRef(ISO4217_CODES);
    return `if (!refs[${i}].has(${varName})) ${ctx.fail('isISO4217CurrencyCode')};`;
  },
);

export { isISBN, isISIN, isISSN, isEAN, isBIC, isCreditCard, isIBAN, isCurrency, isISO4217CurrencyCode };
export type { IsISSNOptions, IsIBANOptions };
