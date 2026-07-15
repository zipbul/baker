import { makeRegexRule, makeStringRule } from './string-shared';

// Full-width characters (Unicode fullwidth forms)
const FULLWIDTH_RE = /[^\u0020-\u007E\uFF61-\uFF9F]/;
// Empty-string guard is redundant — non-anchored char-class regex returns false on empty input.
const isFullWidth = makeRegexRule('isFullWidth', FULLWIDTH_RE);

// Half-width characters
const HALFWIDTH_RE = /[\u0020-\u007E\uFF61-\uFF9F]/;
const isHalfWidth = makeRegexRule('isHalfWidth', HALFWIDTH_RE);

// Variable-width: must contain both full-width AND half-width
const isVariableWidth = makeStringRule(
  'isVariableWidth',
  v => FULLWIDTH_RE.test(v) && HALFWIDTH_RE.test(v),
  (varName, ctx) => {
    const i1 = ctx.addRegex(FULLWIDTH_RE);
    const i2 = ctx.addRegex(HALFWIDTH_RE);
    return `if (!re[${i1}].test(${varName}) || !re[${i2}].test(${varName})) ${ctx.fail('isVariableWidth')};`;
  },
);

// Multibyte: any character outside Latin-1 / half-width range
const MULTIBYTE_RE = new RegExp(`[^${String.fromCharCode(0)}-${String.fromCharCode(0xff)}]`);
const isMultibyte = makeRegexRule('isMultibyte', MULTIBYTE_RE);

// Surrogate pairs
const SURROGATE_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;
const isSurrogatePair = makeRegexRule('isSurrogatePair', SURROGATE_RE);

export { isFullWidth, isHalfWidth, isVariableWidth, isMultibyte, isSurrogatePair };
