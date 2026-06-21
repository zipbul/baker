import type { SealOptions } from './interfaces';

/** Built-in constructors that are NOT treated as nested DTOs during seal. */
export const PRIMITIVE_CTORS = new Set<Function>([Number, String, Boolean, Date]);

/**
 * The runtime key list of {@link SealOptions}, in fixed order. Built from a `Record<keyof SealOptions,
 * true>` so a new (or removed) SealOptions field is a COMPILE error here until covered. Single source
 * for the compile-cache fingerprint (its bit order) and the runtime per-call seal-time-key rejection.
 */
export const SEAL_OPTION_KEYS = Object.keys({
  enableImplicitConversion: true,
  exposeDefaultValues: true,
  stopAtFirstError: true,
  whitelist: true,
  debug: true,
} satisfies Record<keyof SealOptions, true>) as (keyof SealOptions)[];

/**
 * Property names that must never be used as a field key, an @Expose wire name, or a discriminator
 * property — writing them onto the output object corrupts its prototype/shape (prototype pollution).
 * Single source shared by every seal-time gate (seal.ts, expose-validator.ts, meta-validator.ts).
 */
export const RESERVED_PROPERTY_NAMES = new Set<string>(['__proto__', 'constructor', 'prototype']);

// ─────────────────────────────────────────────────────────────────────────────
// Generated variable-name prefixes — centralised to prevent typo-related bugs. The deserialize and
// serialize codegen use DISTINCT name tables (different generated locals); they must stay separate.
// ─────────────────────────────────────────────────────────────────────────────

/** Deserialize codegen variable-name table (imported as `GEN` by the deserialize builder/codegen). */
export const DES_GEN = {
  field: '__bk$f_',
  index: '__bk$i_',
  setIdx: '__bk$si_',
  setVal: '__bk$sv_',
  mapIdx: '__bk$mi_',
  mapVal: '__bk$mv_',
  mark: '__bk$mark_',
  skip: '__bk$skip_',
  result: '__bk$r_',
  errors: '__bk$re_',
  arr: '__bk$arr_',
  disc: '__bk$dt_',
  nestedIdx: '__bk$j_',
  out: '__bk$out',
  errList: '__bk$errors',
  groups: '__bk$groups',
  group0: '__bk$group0',
  groupsSet: '__bk$groupsSet',
  key: '__bk$k',
} as const;

/** Serialize codegen variable-name table (imported as `GEN` by the serialize builder). */
export const SER_GEN = {
  out: '__bk$out',
  fieldVal: '__bk$fv_',
  groups: '__bk$groups',
  group0: '__bk$group0',
  groupsSet: '__bk$groupsSet',
  setArr: '__bk$sa',
  setItem: '__bk$si',
  mapObj: '__bk$m',
  mapEntry: '__bk$me',
  serResult: '__bk$sr',
  outItem: '__bk$out_item',
  discArr: '__bk$da',
  discIdx: '__bk$di',
  nestedArr: '__bk$na',
  nestedIdx: '__bk$ni',
  nestedItem: '__bk$nitem',
} as const;

/** `@Type`() primitive builtin → target type mapping */
export const PRIMITIVE_TYPE_HINTS: Record<string, string> = {
  Number: 'number',
  Boolean: 'boolean',
  String: 'string',
  Date: 'date',
};

/** Asserter rule name → gate type mapping */
export const ASSERTER_TO_GATE: Record<string, string> = {
  isString: 'string',
  isNumber: 'number',
  isBoolean: 'boolean',
  isDate: 'date',
  isInt: 'number',
  isArray: 'array',
  isObject: 'object',
};

/** Asserters whose gate check fully subsumes the rule (skip emit inside gate) */
export const GATE_ONLY_ASSERTERS = new Set(['isString', 'isBoolean', 'isDate', 'isArray', 'isObject']);
