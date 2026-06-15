import { describe, it, expect } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import { isString, isNumber, isBoolean, isEmail, min, minLength, maxLength, matches, contains } from '../../src/rules/index';
import { assertBakerIssueSet, assertNotBakerIssueSet } from '../integration/helpers/assert';
import { applyField } from '../integration/helpers/modern-decorator';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Empty object to DTO with many required fields
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — empty object to DTO with many required fields', () => {
  const baker = new Baker();
  @baker.Recipe
  class ManyFieldsDto {
    @Field(isString) a!: string;
    @Field(isString) b!: string;
    @Field(isString) c!: string;
    @Field(isNumber()) d!: number;
    @Field(isNumber()) e!: number;
    @Field(isBoolean) f!: boolean;
    @Field(isString) g!: string;
    @Field(isString) h!: string;
    @Field(isNumber()) i!: number;
    @Field(isString) j!: string;
  }

  baker.seal();

  it('all errors collected for empty input', async () => {
    const result = await baker.deserialize(ManyFieldsDto, {});
    assertBakerIssueSet(result);
    const paths = result.errors.map(e => e.path);
    expect(paths).toContain('a');
    expect(paths).toContain('b');
    expect(paths).toContain('c');
    expect(paths).toContain('d');
    expect(paths).toContain('e');
    expect(paths).toContain('f');
    expect(paths).toContain('g');
    expect(paths).toContain('h');
    expect(paths).toContain('i');
    expect(paths).toContain('j');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Deeply nested DTO (10+ levels)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — deeply nested DTO (10+ levels)', () => {
  const baker = new Baker();
  @baker.Recipe
  class L10 {
    @Field(isString) v!: string;
  }
  @baker.Recipe
  class L9 {
    @Field({ type: () => L10 }) c!: L10;
  }
  @baker.Recipe
  class L8 {
    @Field({ type: () => L9 }) c!: L9;
  }
  @baker.Recipe
  class L7 {
    @Field({ type: () => L8 }) c!: L8;
  }
  @baker.Recipe
  class L6 {
    @Field({ type: () => L7 }) c!: L7;
  }
  @baker.Recipe
  class L5 {
    @Field({ type: () => L6 }) c!: L6;
  }
  @baker.Recipe
  class L4 {
    @Field({ type: () => L5 }) c!: L5;
  }
  @baker.Recipe
  class L3 {
    @Field({ type: () => L4 }) c!: L4;
  }
  @baker.Recipe
  class L2 {
    @Field({ type: () => L3 }) c!: L3;
  }
  @baker.Recipe
  class L1 {
    @Field({ type: () => L2 }) c!: L2;
  }
  @baker.Recipe
  class Root {
    @Field({ type: () => L1 }) c!: L1;
  }

  baker.seal();

  it('no stack overflow on 11-level nesting', async () => {
    const input = { c: { c: { c: { c: { c: { c: { c: { c: { c: { c: { v: 'deep' } } } } } } } } } } };
    const result = (await baker.deserialize<Root>(Root, input)) as Root;
    expect(result.c.c.c.c.c.c.c.c.c.c.v).toBe('deep');
  });

  it('validation error at deepest level has correct path', async () => {
    const input = { c: { c: { c: { c: { c: { c: { c: { c: { c: { c: { v: 123 } } } } } } } } } } };
    const result = await baker.deserialize(Root, input);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.path).toBe('c.c.c.c.c.c.c.c.c.c.v');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 1000+ fields DTO (dynamic definition)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — 1000+ fields DTO', () => {
  const baker = new Baker();
  class BigDto {}
  for (let i = 0; i < 1000; i++) {
    applyField(Field(isNumber()), BigDto, `f${i}`);
  }
  baker.Recipe(BigDto, undefined as never);

  baker.seal();

  it('all 1000 fields validate correctly', async () => {
    const input: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      input[`f${i}`] = i;
    }
    const result = await baker.deserialize<BigDto>(BigDto, input);
    expect(isBakerIssueSet(result)).toBe(false);
    expect((result as Record<string, number>)['f0']).toBe(0);
    expect((result as Record<string, number>)['f999']).toBe(999);
  });

  it('all 1000 fields report errors on invalid input', async () => {
    const input: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) {
      input[`f${i}`] = 'bad';
    }
    const result = await baker.deserialize(BigDto, input);
    assertBakerIssueSet(result);
    expect(result.errors.length).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Circular reference DTO with circular input
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — circular reference detection', () => {
  const baker = new Baker();
  @baker.Recipe
  class TreeNode {
    @Field(isString) value!: string;
    @Field({ optional: true, type: () => TreeNode }) child?: TreeNode;
  }

  baker.seal();

  it('actual circular input detected', async () => {
    const obj: { value: string; child: { value: string; child?: unknown } } = { value: 'a', child: { value: 'b' } };
    obj.child.child = obj;
    const result = await baker.deserialize(TreeNode, obj);
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'circular')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Same DTO deserialized 10000 times in a loop
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — 10000 deserializations', () => {
  const baker = new Baker();
  @baker.Recipe
  class SimpleDto {
    @Field(isString) name!: string;
    @Field(isNumber()) age!: number;
  }

  baker.seal();

  it('no memory leak and all results valid', async () => {
    const input = { name: 'test', age: 25 };
    for (let i = 0; i < 10_000; i++) {
      const result = (await baker.deserialize<SimpleDto>(SimpleDto, input)) as SimpleDto;
      expect(result.name).toBe('test');
      expect(result.age).toBe(25);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Concurrent deserialize calls (Promise.all with 100)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — concurrent deserialize calls', () => {
  const baker = new Baker();
  @baker.Recipe
  class ConcurrentDto {
    @Field(isString) id!: string;
    @Field(isNumber()) val!: number;
  }

  baker.seal();

  it('100 concurrent calls all resolve correctly', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      baker.deserialize<ConcurrentDto>(ConcurrentDto, { id: `item-${i}`, val: i }),
    );
    const results = await Promise.all(promises);
    for (let i = 0; i < 100; i++) {
      expect(isBakerIssueSet(results[i])).toBe(false);
      const dto = results[i] as ConcurrentDto;
      expect(dto.id).toBe(`item-${i}`);
      expect(dto.val).toBe(i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. DTO with every rule type on one field
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — every rule type on one field', () => {
  const baker = new Baker();
  @baker.Recipe
  class KitchenSinkDto {
    @Field(isString, minLength(5), maxLength(100), matches(/\w+/), contains('@'), isEmail())
    email!: string;
  }

  baker.seal();

  it('valid value passes all rules', async () => {
    const result = (await baker.deserialize<KitchenSinkDto>(KitchenSinkDto, { email: 'longuser@example.com' })) as KitchenSinkDto;
    expect(result.email).toBe('longuser@example.com');
  });

  it('short string fails minLength among other rules', async () => {
    const result = await baker.deserialize(KitchenSinkDto, { email: 'a@b' });
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'minLength')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Extremely long string (100KB)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — extremely long string (100KB)', () => {
  const baker = new Baker();
  @baker.Recipe
  class LongStringDto {
    @Field(isString) content!: string;
  }

  baker.seal();

  it('100KB string passes isString', async () => {
    const longStr = 'x'.repeat(100_000);
    const result = (await baker.deserialize<LongStringDto>(LongStringDto, { content: longStr })) as LongStringDto;
    expect(result.content).toHaveLength(100_000);
  });

  it('100KB string fails minLength if too short constraint not met', async () => {
    const b = new Baker();
    @b.Recipe
    class D {
      @Field(isString, minLength(200_000)) v!: string;
    }
    b.seal();
    const result = await b.deserialize(D, { v: 'x'.repeat(100_000) });
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'minLength')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Extremely large number (MAX_SAFE_INTEGER + 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — extremely large number', () => {
  const baker = new Baker();
  @baker.Recipe
  class NumberDto {
    @Field(isNumber()) val!: number;
  }

  baker.seal();

  it('MAX_SAFE_INTEGER passes isNumber', async () => {
    const result = (await baker.deserialize<NumberDto>(NumberDto, { val: Number.MAX_SAFE_INTEGER })) as NumberDto;
    expect(result.val).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('MAX_SAFE_INTEGER + 1 still passes isNumber (it is a valid number)', async () => {
    const result = (await baker.deserialize<NumberDto>(NumberDto, { val: Number.MAX_SAFE_INTEGER + 1 })) as NumberDto;
    expect(result.val).toBe(Number.MAX_SAFE_INTEGER + 1);
  });

  it('NaN fails isNumber by default', async () => {
    const result = await baker.deserialize(NumberDto, { val: NaN });
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('Infinity fails isNumber by default', async () => {
    const result = await baker.deserialize(NumberDto, { val: Infinity });
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('-Infinity fails isNumber by default', async () => {
    const result = await baker.deserialize(NumberDto, { val: -Infinity });
    expect(isBakerIssueSet(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. null, undefined, NaN, Infinity, -Infinity, '', 0, false as inputs
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — special values as top-level input', () => {
  const baker = new Baker();
  @baker.Recipe
  class Dto {
    @Field(isString) v!: string;
  }

  baker.seal();

  it('null input produces error', async () => {
    const result = await baker.deserialize(Dto, null);
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('undefined input produces error', async () => {
    const result = await baker.deserialize(Dto, undefined);
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('NaN input produces error', async () => {
    const result = await baker.deserialize(Dto, NaN);
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('Infinity input produces error', async () => {
    const result = await baker.deserialize(Dto, Infinity);
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('-Infinity input produces error', async () => {
    const result = await baker.deserialize(Dto, -Infinity);
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('empty string input produces error', async () => {
    const result = await baker.deserialize(Dto, '');
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('0 input produces error', async () => {
    const result = await baker.deserialize(Dto, 0);
    expect(isBakerIssueSet(result)).toBe(true);
  });

  it('false input produces error', async () => {
    const result = await baker.deserialize(Dto, false);
    expect(isBakerIssueSet(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Prototype pollution attempt
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — prototype pollution attempt', () => {
  const baker = new Baker();
  @baker.Recipe
  class SafeDto {
    @Field(isString) name!: string;
  }

  baker.seal();

  it('__proto__ key does not pollute result', async () => {
    const malicious = JSON.parse('{"name":"ok","__proto__":{"polluted":true}}');
    const result = await baker.deserialize<SafeDto>(SafeDto, malicious);
    assertNotBakerIssueSet(result);
    expect(result.name).toBe('ok');
    expect((result as SafeDto & { polluted?: unknown }).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('constructor key does not pollute result', async () => {
    const malicious = JSON.parse('{"name":"ok","constructor":{"prototype":{"polluted":true}}}');
    const result = await baker.deserialize<SafeDto>(SafeDto, malicious);
    assertNotBakerIssueSet(result);
    expect(result.name).toBe('ok');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('forbidUnknown mode rejects __proto__ and constructor', async () => {
    const b = new Baker({ forbidUnknown: true });
    @b.Recipe
    class ForbidSafeDto {
      @Field(isString) name!: string;
    }
    b.seal();
    const malicious = JSON.parse('{"name":"ok","__proto__":{"p":true},"constructor":{}}');
    const result = await b.deserialize(ForbidSafeDto, malicious);
    assertBakerIssueSet(result);
    expect(result.errors.some(e => e.code === 'whitelistViolation')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. DTO with async transform that takes time
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — async transform with delay', () => {
  const baker = new Baker();
  @baker.Recipe
  class AsyncDelayDto {
    @Field(isString, {
      transform: {
        deserialize: async ({ value }) => {
          await new Promise(r => setTimeout(r, 10));
          return typeof value === 'string' ? value.toUpperCase() : value;
        },
        serialize: ({ value }) => value,
      },
    })
    name!: string;
  }

  baker.seal();

  it('async transform with delay still resolves', async () => {
    const result = (await baker.deserialize<AsyncDelayDto>(AsyncDelayDto, { name: 'hello' })) as AsyncDelayDto;
    expect(result.name).toBe('HELLO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Deserialize then serialize roundtrip
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — deserialize then serialize roundtrip', () => {
  const baker = new Baker();
  @baker.Recipe
  class AddressDto {
    @Field(isString) city!: string;
    @Field(isString) zip!: string;
  }

  @baker.Recipe
  class ProfileDto {
    @Field(isString, { name: 'full_name' }) fullName!: string;
    @Field(isNumber(), min(0)) age!: number;
    @Field(isBoolean) active!: boolean;
    @Field({ type: () => AddressDto }) address!: AddressDto;
    @Field(isString, { optional: true, nullable: true }) bio?: string | null;
    @Field({ type: () => [AddressDto] }) addresses!: AddressDto[];
  }

  baker.seal();

  it('full roundtrip preserves data integrity', async () => {
    const input = {
      full_name: 'Alice',
      age: 30,
      active: true,
      address: { city: 'Seoul', zip: '06000' },
      bio: 'Hello',
      addresses: [
        { city: 'Busan', zip: '48000' },
        { city: 'Daegu', zip: '41000' },
      ],
    };
    const obj = (await baker.deserialize<ProfileDto>(ProfileDto, input)) as ProfileDto;
    expect(obj.fullName).toBe('Alice');
    expect(obj.age).toBe(30);
    expect(obj.active).toBe(true);
    expect(obj.address.city).toBe('Seoul');

    const plain = await baker.serialize(obj);
    expect(plain['full_name']).toBe('Alice');
    expect(plain['age']).toBe(30);
    expect(plain['active']).toBe(true);

    const obj2 = (await baker.deserialize<ProfileDto>(ProfileDto, plain)) as ProfileDto;
    expect(obj2.fullName).toBe('Alice');
    expect(obj2.age).toBe(30);
    expect(obj2.address.city).toBe('Seoul');
    expect(obj2.addresses).toHaveLength(2);
    expect(obj2.addresses[0]!.city).toBe('Busan');
    expect(obj2.addresses[1]!.city).toBe('Daegu');
  });

  it('roundtrip with null value', async () => {
    const input = {
      full_name: 'Bob',
      age: 25,
      active: false,
      address: { city: 'Tokyo', zip: '10000' },
      bio: null,
      addresses: [],
    };
    const obj = (await baker.deserialize<ProfileDto>(ProfileDto, input)) as ProfileDto;
    expect(obj.bio).toBeNull();

    const plain = await baker.serialize(obj);
    const obj2 = (await baker.deserialize<ProfileDto>(ProfileDto, plain)) as ProfileDto;
    expect(obj2.bio).toBeNull();
  });

  it('roundtrip with missing optional value', async () => {
    const input = {
      full_name: 'Carol',
      age: 40,
      active: true,
      address: { city: 'Osaka', zip: '53000' },
      addresses: [],
    };
    const obj = (await baker.deserialize<ProfileDto>(ProfileDto, input)) as ProfileDto;
    expect(obj.bio).toBeUndefined();

    const plain = await baker.serialize(obj);
    const obj2 = (await baker.deserialize<ProfileDto>(ProfileDto, plain)) as ProfileDto;
    expect(obj2.bio).toBeUndefined();
  });
});
