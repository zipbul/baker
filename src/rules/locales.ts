import type { EmitContext, EmittableRule } from './interfaces';

import { BakerError } from '../common';
import { MOBILE_PHONE_REGEXES, POSTAL_CODE_REGEXES, IDENTITY_CARD_REGEXES, PASSPORT_REGEXES } from './constants';
import { RequiredType } from './enums';
import { makeRule } from './rule-plan';

// ─────────────────────────────────────────────────────────────────────────────
// Locale-specific Validators
// ─────────────────────────────────────────────────────────────────────────────

// ─── isMobilePhone ────────────────────────────────────────────────────────────

function isMobilePhone(locale: string): EmittableRule<string> {
  return makeLocaleRegexRule('isMobilePhone', locale, MOBILE_PHONE_REGEXES);
}

// ─── isPostalCode ─────────────────────────────────────────────────────────────

function isPostalCode(locale: string): EmittableRule<string> {
  return makeLocaleRegexRule('isPostalCode', locale, POSTAL_CODE_REGEXES);
}

// ─── isIdentityCard ───────────────────────────────────────────────────────────

function isIdentityCard(locale: string): EmittableRule<string> {
  return makeLocaleRegexRule('isIdentityCard', locale, IDENTITY_CARD_REGEXES);
}

// ─── isPassportNumber ─────────────────────────────────────────────────────────

function isPassportNumber(locale: string): EmittableRule<string> {
  return makeLocaleRegexRule('isPassportNumber', locale, PASSPORT_REGEXES);
}
function makeLocaleRegexRule(name: string, locale: string, registry: Record<string, RegExp>): EmittableRule<string> {
  const re = registry[locale];
  if (!re) {
    throw new BakerError(`Unsupported locale: "${locale}" for ${name}`);
  }
  return makeRule<string>({
    name,
    requiresType: RequiredType.String,
    constraints: { locale },
    validate: value => typeof value === 'string' && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail(name)};`;
    },
  });
}
export { isMobilePhone, isPostalCode, isIdentityCard, isPassportNumber };
