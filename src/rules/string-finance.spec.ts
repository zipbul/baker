import { describe, it, expect, mock } from 'bun:test';
import { RequiredType } from './enums';

import type { EmitContext } from './interfaces';

import {
  isISBN,
  isISIN,
  isISSN,
  isEAN,
  isBIC,
  isCreditCard,
  isIBAN,
  isCurrency,
  isISO4217CurrencyCode,
} from './string';

function makeCtx(refIndex: number = 0) {
  const addRefMock = mock((_fn: unknown) => refIndex);
  const addRegexMock = mock((_re: RegExp) => refIndex);
  const failMock = mock((code: string) => `_errors.push({path:'x',code:'${code}'})`);
  const ctx: Partial<EmitContext> = {
    addRegex: addRegexMock,
    addRef: addRefMock,
    addExecutor: mock(() => 0),
    fail: failMock,
    collectErrors: true,
  };
  return { ctx: ctx as EmitContext, addRefMock, addRegexMock, failMock };
}

describe('isISBN', () => {
  it('should return true for valid ISBN-13', () => {
    expect(isISBN()('978-3-16-148410-0')).toBe(true);
  });

  it('should return true for valid ISBN-10', () => {
    expect(isISBN()('0-306-40615-2')).toBe(true);
  });

  it('should return false for invalid ISBN', () => {
    expect(isISBN()('1234567890')).toBe(false);
  });

  it('should return true for ISBN-13 with version 13 constraint', () => {
    expect(isISBN(13)('978-3-16-148410-0')).toBe(true);
  });

  it('should return false for ISBN-10 with version 13 constraint', () => {
    expect(isISBN(13)('0-306-40615-2')).toBe(false);
  });

  it('should generate code when calling emit() and have ruleName isISBN', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = isISBN().emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isISBN');
    expect(isISBN().ruleName).toBe('isISBN');
    expect(isISBN().requiresType).toBe(RequiredType.String);
  });
});

describe('isISIN', () => {
  it('should return true for valid ISIN', () => {
    expect(isISIN('US0378331005')).toBe(true);
  });

  it('should return false for invalid ISIN', () => {
    expect(isISIN('US03783310')).toBe(false);
  });

  it('should return false for ISIN that passes regex but fails Luhn checksum', () => {
    // US0378331006 matches ISIN_RE but has wrong Luhn check digit (valid: US0378331005)
    expect(isISIN('US0378331006')).toBe(false);
  });

  it('should emit inline regex + Luhn checksum code (no addRef)', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = isISIN.emit('v', ctx);
    expect(addRefMock).not.toHaveBeenCalled();
    expect(code).toContain('re[');
    expect(code).toContain('isSum');
    expect(failMock).toHaveBeenCalledWith('isISIN');
    expect(isISIN.ruleName).toBe('isISIN');
  });
});
describe('isISSN', () => {
  it('should return true for valid ISSN', () => {
    expect(isISSN()('0378-5955')).toBe(true);
  });

  it('should return false for invalid ISSN', () => {
    expect(isISSN()('1234-5678')).toBe(false);
  });

  it('should return true for ISSN without hyphen when requireHyphen is false', () => {
    expect(isISSN({ requireHyphen: false })('03785955')).toBe(true);
  });

  it('should return false for ISSN that passes regex but fails mod-11 checksum', () => {
    // 0378-5950 matches regex \\d{4}-\\d{3}[\\dX] but check-digit 0 is wrong (valid: 0378-5955)
    expect(isISSN()('0378-5950')).toBe(false);
  });

  it('should emit inline regex + mod-11 checksum code (no addRef)', () => {
    const { ctx, addRefMock, failMock } = makeCtx(0);
    const code = isISSN().emit('v', ctx);
    expect(addRefMock).not.toHaveBeenCalled();
    expect(code).toContain('re[');
    expect(code).toContain('iss');
    expect(failMock).toHaveBeenCalledWith('isISSN');
    expect(isISSN().ruleName).toBe('isISSN');
  });
});
describe('isEAN', () => {
  it('should return true for valid EAN-13', () => {
    expect(isEAN('5901234123457')).toBe(true);
  });

  it('should return true for valid EAN-8', () => {
    expect(isEAN('96385074')).toBe(true);
  });

  it('should return false for invalid EAN', () => {
    expect(isEAN('1234567890123')).toBe(false);
  });

  it('should generate code when calling emit() and have ruleName isEAN', () => {
    const { ctx, failMock } = makeCtx(0);
    const code = isEAN.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isEAN');
    expect(isEAN.ruleName).toBe('isEAN');
  });
});
describe('isBIC', () => {
  it('should return true for valid BIC/SWIFT code (8 chars)', () => {
    expect(isBIC('DEUTDEDB')).toBe(true);
  });

  it('should return true for valid BIC/SWIFT code (11 chars)', () => {
    expect(isBIC('DEUTDEDBFRA')).toBe(true);
  });

  it('should return false for invalid BIC', () => {
    expect(isBIC('INVALID')).toBe(false);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isBIC', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isBIC.emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalledTimes(1);
    expect(failMock).toHaveBeenCalledWith('isBIC');
    expect(isBIC.ruleName).toBe('isBIC');
  });
});
describe('isCurrency', () => {
  it('should return true for valid currency amount', () => {
    expect(isCurrency()('$10.50')).toBe(true);
  });

  it('should return true for amount without symbol', () => {
    expect(isCurrency()('100.00')).toBe(true);
  });

  it('should return false for invalid currency format', () => {
    expect(isCurrency()('abc')).toBe(false);
  });

  it('should return false for double sign', () => {
    expect(isCurrency()('+-5')).toBe(false);
    expect(isCurrency()('-$-5')).toBe(false);
    expect(isCurrency()('+$-5')).toBe(false);
  });

  it('should return true for a single sign before or after the currency symbol', () => {
    expect(isCurrency()('-5')).toBe(true);
    expect(isCurrency()('-$5')).toBe(true);
    expect(isCurrency()('$-5')).toBe(true);
    expect(isCurrency()('+$5')).toBe(true);
    expect(isCurrency()('$5')).toBe(true);
  });

  it('should call ctx.addRegex and generate test code when calling emit() and have ruleName isCurrency', () => {
    const { ctx, addRegexMock, failMock } = makeCtx(0);
    isCurrency().emit('v', ctx);
    expect(addRegexMock).toHaveBeenCalled();
    expect(failMock).toHaveBeenCalledWith('isCurrency');
    expect(isCurrency().ruleName).toBe('isCurrency');
  });
});
describe('isCreditCard', () => {
  it('should return true for valid Visa test number (Luhn pass)', () => {
    expect(isCreditCard('4111111111111111')).toBe(true);
  });

  it('should return true for valid Mastercard test number', () => {
    expect(isCreditCard('5500005555555559')).toBe(true);
  });

  it('should return true for valid Amex test number', () => {
    expect(isCreditCard('378282246310005')).toBe(true);
  });

  it('should return true for number with dashes stripped', () => {
    expect(isCreditCard('4111-1111-1111-1111')).toBe(true);
  });

  it('should return true for number with spaces stripped', () => {
    expect(isCreditCard('4111 1111 1111 1111')).toBe(true);
  });

  it('should return false for number failing Luhn check', () => {
    expect(isCreditCard('1234567890123456')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isCreditCard('')).toBe(false);
  });

  it('should generate Luhn algorithm inline code when calling emit() and have ruleName isCreditCard', () => {
    const { ctx, failMock } = makeCtx();
    const code = isCreditCard.emit('v', ctx);
    expect(code).toContain('%');
    expect(failMock).toHaveBeenCalledWith('isCreditCard');
    expect(isCreditCard.ruleName).toBe('isCreditCard');
    expect(isCreditCard.requiresType).toBe(RequiredType.String);
  });
});

describe('isIBAN', () => {
  it('should return true for valid IBAN (GB)', () => {
    expect(isIBAN()('GB82WEST12345698765432')).toBe(true);
  });

  it('should return true for valid IBAN with spaces when allowSpaces is true', () => {
    expect(isIBAN({ allowSpaces: true })('GB82 WEST 1234 5698 7654 32')).toBe(true);
  });

  it('should return false for invalid IBAN checksum', () => {
    expect(isIBAN()('GB00WEST12345698765432')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isIBAN()('')).toBe(false);
  });

  it('should generate mod-97 algorithm code when calling emit() and have ruleName isIBAN', () => {
    const { ctx, failMock } = makeCtx();
    const code = isIBAN().emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isIBAN');
    expect(isIBAN().ruleName).toBe('isIBAN');
    expect(isIBAN().requiresType).toBe(RequiredType.String);
  });

  it('should return independent rule objects on multiple factory calls', () => {
    const r1 = isIBAN();
    const r2 = isIBAN();
    expect(r1).not.toBe(r2);
  });
});
describe('isISO4217CurrencyCode', () => {
  it('should return true for USD', () => {
    expect(isISO4217CurrencyCode('USD')).toBe(true);
  });

  it('should return true for EUR', () => {
    expect(isISO4217CurrencyCode('EUR')).toBe(true);
  });

  it('should return true for KRW', () => {
    expect(isISO4217CurrencyCode('KRW')).toBe(true);
  });

  it('should return false for lowercase usd', () => {
    expect(isISO4217CurrencyCode('usd')).toBe(false);
  });

  it('should return false for non-existent code XXX', () => {
    expect(isISO4217CurrencyCode('XXX')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isISO4217CurrencyCode('')).toBe(false);
  });

  it('should return false for non-string input', () => {
    expect(isISO4217CurrencyCode(123 as never)).toBe(false);
  });

  it('should have requiresType string and ruleName isISO4217CurrencyCode', () => {
    expect(isISO4217CurrencyCode.requiresType).toBe(RequiredType.String);
    expect(isISO4217CurrencyCode.ruleName).toBe('isISO4217CurrencyCode');
  });

  it('should generate emit code', () => {
    const { ctx, failMock } = makeCtx();
    const code = isISO4217CurrencyCode.emit('v', ctx);
    expect(code).toBeTruthy();
    expect(failMock).toHaveBeenCalledWith('isISO4217CurrencyCode');
  });
});
