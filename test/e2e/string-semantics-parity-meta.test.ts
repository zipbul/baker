import { afterEach, describe, expect, it } from 'bun:test';
import { deserialize, Field, isBakerError } from '../../index';
import {
  contains,
  isAlpha,
  isAlphanumeric,
  isAscii,
  isBase64,
  isBooleanString,
  isCUID2,
  isDecimal,
  isEmail,
  isFullWidth,
  isHalfWidth,
  isHexColor,
  isHexadecimal,
  isJSON,
  isJWT,
  isLowercase,
  isMimeType,
  isMongoId,
  isOctal,
  isSemVer,
  isULID,
  isUppercase,
  isUUID,
  isVariableWidth,
  isMultibyte,
  matches,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

type StringRuleCase = {
  name: string;
  rule: (value: unknown) => boolean | Promise<boolean>;
  samples: unknown[];
};

async function dtoPasses(rule: any, value: unknown): Promise<boolean> {
  class Dto {
    @Field(rule)
    value!: unknown;
  }

  const result = await deserialize(Dto, { value });
  return !isBakerError(result);
}

const cases: StringRuleCase[] = [
  { name: 'isAscii', rule: isAscii, samples: ['abc', 'ABC123', '한글', 1, null] },
  { name: 'isAlpha', rule: isAlpha, samples: ['abc', 'abc123', '', 1] },
  { name: 'isAlphanumeric', rule: isAlphanumeric, samples: ['abc123', 'abc-123', '', false] },
  { name: 'isBooleanString', rule: isBooleanString, samples: ['true', 'false', 'TRUE', 'x', 1] },
  { name: 'isDecimal()', rule: isDecimal(), samples: ['3.14', '-1.0', 'abc', 1] },
  { name: 'contains("zip")', rule: contains('zip'), samples: ['zip', 'zipbul', 'bul', 10] },
  { name: 'matches(/^[a-z]+$/)', rule: matches(/^[a-z]+$/), samples: ['abc', 'ABC', 'abc1', null] },
  { name: 'isLowercase', rule: isLowercase, samples: ['abc', 'Abc', 'ABC', 1] },
  { name: 'isUppercase', rule: isUppercase, samples: ['ABC', 'ABc', 'abc', []] },
  { name: 'isFullWidth', rule: isFullWidth, samples: ['ＡＢＣ', 'abc', '한글', null] },
  { name: 'isHalfWidth', rule: isHalfWidth, samples: ['abc', 'ＡＢＣ', '한글', null] },
  { name: 'isVariableWidth', rule: isVariableWidth, samples: ['abc한글', 'abc', '한글', null] },
  { name: 'isMultibyte', rule: isMultibyte, samples: ['한글', 'abc', 'テスト', null] },
  { name: 'isHexadecimal', rule: isHexadecimal, samples: ['deadBEEF', 'xyz', '123', false] },
  { name: 'isOctal', rule: isOctal, samples: ['0o777', '777', '89', 7] },
  { name: 'isEmail()', rule: isEmail(), samples: ['a@test.com', 'bad', '', 1] },
  { name: 'isUUID()', rule: isUUID(), samples: ['550e8400-e29b-41d4-a716-446655440000', 'bad', 1] },
  { name: 'isHexColor', rule: isHexColor, samples: ['#ff00aa', 'ff00aa', '#xyz', null] },
  { name: 'isJWT', rule: isJWT, samples: ['a.b.c', 'abc', '', 1] },
  { name: 'isJSON', rule: isJSON, samples: ['{"a":1}', '[1,2]', '{bad}', 1] },
  { name: 'isBase64()', rule: isBase64(), samples: ['aGVsbG8=', 'bad', 'Zm9vYmFy', 1] },
  { name: 'isMimeType', rule: isMimeType, samples: ['text/plain', 'application/json', 'bad', 1] },
  { name: 'isSemVer', rule: isSemVer, samples: ['1.2.3', '1.2', 'v1.2.3', false] },
  { name: 'isMongoId', rule: isMongoId, samples: ['507f1f77bcf86cd799439011', 'bad', 1] },
  { name: 'isULID()', rule: isULID(), samples: ['01ARZ3NDEKTSV4RRFFQ69G5FAV', 'bad', 1] },
  { name: 'isCUID2()', rule: isCUID2(), samples: ['tz4a98xxat96iws9zmbrgj3a', 'bad', 1] },
];

describe('string semantics parity meta', () => {
  for (const testCase of cases) {
    it(testCase.name, async () => {
      for (const sample of testCase.samples) {
        const runtime = !!(await testCase.rule(sample));
        const dto = await dtoPasses(testCase.rule, sample);
        expect(dto, `${testCase.name} mismatch for ${String(sample)}`).toBe(runtime);
      }
    });
  }
});
