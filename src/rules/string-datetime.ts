import { makeStringRule } from './string-shared';

const RFC3339_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

const isRFC3339 = makeStringRule(
  'isRFC3339',
  v => RFC3339_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(RFC3339_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isRFC3339')};`;
  },
);

const MILITARY_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isMilitaryTime = makeStringRule(
  'isMilitaryTime',
  v => MILITARY_TIME_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MILITARY_TIME_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isMilitaryTime')};`;
  },
);

export { isRFC3339, isMilitaryTime };
