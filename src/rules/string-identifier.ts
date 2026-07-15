import type { EmitContext, EmittableRule } from './interfaces';

import { ISO31661A2_CODES, ISO31661A3_CODES } from './constants';
import { RequiredType } from './enums';
import { makeRule } from './rule-plan';
import { makeRegexRule, makeStringRule } from './string-shared';

// Last calendar day of a month (1-based) under the proleptic Gregorian leap rule, valid for ALL years.
// `new Date(year, month, 0)` cannot be used: a 0–99 year argument is remapped to 1900–1999 (so year 0,
// a leap year by the 400 rule, would be judged against 1900). Pure arithmetic — also avoids a Date
// allocation in the validation hot path.
function lastDayOfMonth(year: number, month: number): number {
  if (month === 2) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

// Codegen counterpart of `lastDayOfMonth` — inline expression over already-declared year/month vars.
function lastDayOfMonthExpr(yExpr: string, mExpr: string): string {
  return `(${mExpr}===2?(((${yExpr}%4===0&&${yExpr}%100!==0)||${yExpr}%400===0)?29:28):(${mExpr}===4||${mExpr}===6||${mExpr}===9||${mExpr}===11?30:31))`;
}

// ISO 8601
const ISO8601_RE = /^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)?)?$/;

interface IsISO8601Options {
  strict?: boolean;
}

// Strict ISO8601: requires month/day AND hour/minute/second to be valid values
function validateISO8601Strict(v: string): boolean {
  if (!ISO8601_RE.test(v)) {
    return false;
  }
  const m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) {
    return true;
  } // year-only — no month/day to range-check
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    return false;
  }
  if (m[3] !== undefined) {
    const day = Number(m[3]);
    const maxDay = lastDayOfMonth(Number(m[1]), month);
    if (day < 1 || day > maxDay) {
      return false;
    }
  }
  // Time component check: hour 0-23, minute 0-59, second 0-60 (leap second).
  const tm = v.match(/T(\d{2}):(\d{2}):(\d{2})/);
  if (!tm) {
    return true;
  }
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);
  const ss = Number(tm[3]);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 60;
}

function isISO8601(options?: IsISO8601Options): EmittableRule<string> {
  if (options?.strict) {
    const validateStrict = (v: unknown): boolean => typeof v === 'string' && validateISO8601Strict(v);
    return makeRule<string>({
      name: 'isISO8601',
      requiresType: RequiredType.String,
      constraints: { format: 'date-time', strict: true },
      validate: validateStrict,
      emit: (varName: string, ctx: EmitContext): string => {
        const i = ctx.addRegex(ISO8601_RE);
        // Single `__iso_ok` flag so the rule fails AT MOST once: in collect-errors mode `ctx.fail()`
        // pushes without returning, so the date and time checks must funnel into one failure. The time
        // check runs only when the date portion is valid, mirroring `validateISO8601Strict`'s early returns.
        return (
          `if (!re[${i}].test(${varName})) ${ctx.fail('isISO8601')};\n` +
          `else {var __iso_ok=true;` +
          `var dm=${varName}.match(/^(\\d{4})-(\\d{2})(?:-(\\d{2}))?/);` +
          `if(dm){var mo=Number(dm[2]);` +
          `if(mo<1||mo>12){__iso_ok=false;}` +
          `else if(dm[3]!==undefined){var da=Number(dm[3]),dy=Number(dm[1]),md=${lastDayOfMonthExpr('dy', 'mo')};` +
          `if(da<1||da>md){__iso_ok=false;}}}` +
          `if(__iso_ok){var tm=${varName}.match(/T(\\d{2}):(\\d{2}):(\\d{2})/);` +
          `if(tm){var hh=Number(tm[1]),mm=Number(tm[2]),ss=Number(tm[3]);` +
          `if(hh<0||hh>23||mm<0||mm>59||ss<0||ss>60)__iso_ok=false;}}` +
          `if(!__iso_ok)${ctx.fail('isISO8601')};}`
        );
      },
    });
  }
  // non-strict: both validate and emit use same ISO8601_RE
  return makeRegexRule('isISO8601', ISO8601_RE, RequiredType.String, { format: 'date-time', strict: false });
}

// ISRC — ISO 3901
const ISRC_RE = /^[A-Z]{2}-[A-Z0-9]{3}-\d{2}-\d{5}$|^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const isISRC = makeRegexRule('isISRC', ISRC_RE);

const isISO31661Alpha2 = makeRule<string>({
  name: 'isISO31661Alpha2',
  requiresType: RequiredType.String,
  constraints: {},
  validate: value => typeof value === 'string' && ISO31661A2_CODES.has(value.toUpperCase()),
  emit: (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(ISO31661A2_CODES);
    return `if (!refs[${i}].has(${varName}.toUpperCase())) ${ctx.fail('isISO31661Alpha2')};`;
  },
});

const isISO31661Alpha3 = makeRule<string>({
  name: 'isISO31661Alpha3',
  requiresType: RequiredType.String,
  constraints: {},
  validate: value => typeof value === 'string' && ISO31661A3_CODES.has(value.toUpperCase()),
  emit: (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(ISO31661A3_CODES);
    return `if (!refs[${i}].has(${varName}.toUpperCase())) ${ctx.fail('isISO31661Alpha3')};`;
  },
});

// Firebase Push ID — 20 chars, base64url charset (-0-9A-Za-z_)
const FIREBASE_RE = /^[a-zA-Z0-9_-]{20}$/;
const isFirebasePushId = makeRegexRule('isFirebasePushId', FIREBASE_RE);

// SemVer — Semantic Versioning 2.0
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const isSemVer = makeRegexRule('isSemVer', SEMVER_RE);

// MongoDB ObjectId — 24-char hex
const MONGO_ID_RE = /^[0-9a-fA-F]{24}$/;
const isMongoId = makeRegexRule('isMongoId', MONGO_ID_RE);

// DateString — ISO 8601 date only (YYYY-MM-DD) with calendar validity (day must exist in month/year).
const DATE_STRING_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function isCalendarValidDate(v: string): boolean {
  if (!DATE_STRING_RE.test(v)) {
    return false;
  }
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  const maxDay = lastDayOfMonth(y, m);
  return d >= 1 && d <= maxDay;
}

function isDateString(): EmittableRule<string> {
  return makeStringRule('isDateString', isCalendarValidDate, (varName, ctx) => {
    const i = ctx.addRegex(DATE_STRING_RE);
    return (
      `if (!re[${i}].test(${varName})) ${ctx.fail('isDateString')};\n` +
      `else { var y=Number(${varName}.slice(0,4)),m=Number(${varName}.slice(5,7)),d=Number(${varName}.slice(8,10));` +
      `var md=${lastDayOfMonthExpr('y', 'm')}; if(d<1||d>md)${ctx.fail('isDateString')}; }`
    );
  });
}

// ULID
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function isULID(): EmittableRule<string> {
  return makeRegexRule('isULID', ULID_RE, RequiredType.String, { format: 'ulid' });
}

// CUID2 spec: length 24-32, lowercase alphanum, starts with a-z.
const CUID2_RE = /^[a-z][0-9a-z]{23,31}$/;

function isCUID2(): EmittableRule<string> {
  return makeRegexRule('isCUID2', CUID2_RE, RequiredType.String, { format: 'cuid2' });
}

export {
  isISO8601,
  isISRC,
  isISO31661Alpha2,
  isISO31661Alpha3,
  isFirebasePushId,
  isSemVer,
  isMongoId,
  isDateString,
  isULID,
  isCUID2,
};
export type { IsISO8601Options };
