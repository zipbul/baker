import type { EmitContext, EmittableRule } from './interfaces';

import { BakerError } from '../common';
import { HASH_REGEXES } from './constants';
import { RequiredType } from './enums';
import { makeRule } from './rule-plan';
import { makeStringRule } from './string-shared';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const isEthereumAddress = makeStringRule(
  'isEthereumAddress',
  v => ETH_ADDRESS_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ETH_ADDRESS_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isEthereumAddress')};`;
  },
);

const BTC_P2PKH_RE = /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/;

const BTC_P2SH_RE = /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/;

// bech32 (BIP-173): mainnet `bc1` / testnet `tb1`. Case-insensitive but never mixed-case — accept
// all-lowercase or all-uppercase, reject a mix.
const BTC_BECH32_RE = /^(?:(?:bc1|tb1)[a-z0-9]{6,87}|(?:BC1|TB1)[A-Z0-9]{6,87})$/;

const isBtcAddress = makeStringRule(
  'isBtcAddress',
  v => BTC_P2PKH_RE.test(v) || BTC_P2SH_RE.test(v) || BTC_BECH32_RE.test(v),
  (varName, ctx) => {
    const i1 = ctx.addRegex(BTC_P2PKH_RE);
    const i2 = ctx.addRegex(BTC_P2SH_RE);
    const i3 = ctx.addRegex(BTC_BECH32_RE);
    return `if (!re[${i1}].test(${varName}) && !re[${i2}].test(${varName}) && !re[${i3}].test(${varName})) ${ctx.fail('isBtcAddress')};`;
  },
);

function isHash(algorithm: string): EmittableRule {
  const re = HASH_REGEXES[algorithm];
  if (!re) {
    throw new BakerError(`Unsupported algorithm: "${algorithm}" for isHash`);
  }
  return makeRule({
    name: 'isHash',
    requiresType: RequiredType.String,
    constraints: { algorithm },
    validate: value => typeof value === 'string' && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isHash')};`;
    },
  });
}

export { isEthereumAddress, isBtcAddress, isHash };
