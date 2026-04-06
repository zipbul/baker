import { afterEach, describe, expect, it } from 'bun:test';
import { deserialize, Field, isBakerError } from '../../index';
import {
  arrayMinSize,
  contains,
  isNumber,
  isObject,
  isPositive,
  minLength,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomString(rng: () => number): string {
  const alphabet = 'abcxyz01';
  const length = Math.floor(rng() * 6);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(rng() * alphabet.length)]!;
  }
  return out;
}

function randomValue(rng: () => number): unknown {
  const kind = Math.floor(rng() * 8);
  switch (kind) {
    case 0: return randomString(rng);
    case 1: return Math.floor(rng() * 7) - 3;
    case 2: return rng() > 0.5;
    case 3: return null;
    case 4: return [randomString(rng), randomString(rng)].filter(Boolean);
    case 5: return { a: randomString(rng) };
    case 6: return [];
    default: return rng() > 0.5 ? NaN : undefined;
  }
}

async function dtoPasses(rule: any, value: unknown): Promise<boolean> {
  class Dto {
    @Field(rule)
    value!: unknown;
  }
  return !isBakerError(await deserialize(Dto, { value }));
}

describe('deterministic fuzz parity', () => {
  const fuzzCases = [
    { name: 'isNumber()', rule: isNumber() },
    { name: 'isPositive', rule: isPositive },
    { name: 'minLength(2)', rule: minLength(2) },
    { name: 'contains("a")', rule: contains('a') },
    { name: 'arrayMinSize(2)', rule: arrayMinSize(2) },
    { name: 'isObject', rule: isObject },
  ];

  for (const fuzzCase of fuzzCases) {
    it(fuzzCase.name, async () => {
      const rng = makeRng(0xC0FFEE);
      for (let i = 0; i < 100; i++) {
        const value = randomValue(rng);
        const runtime = !!fuzzCase.rule(value);
        const dto = await dtoPasses(fuzzCase.rule, value);
        expect(dto, `${fuzzCase.name} fuzz mismatch at iteration ${i}`).toBe(runtime);
      }
    });
  }
});
