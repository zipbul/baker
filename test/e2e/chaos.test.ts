import { describe, it, expect, afterEach } from 'bun:test';
import {
  deserialize, serialize, validate, configure,
  Field, isBakerError, createRule,
} from '../../index';
import {
  isString, isNumber, isBoolean, isEmail,
  min, minLength, maxLength, matches, contains,
} from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// 1. Empty object to DTO with many required fields
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — empty object to DTO with many required fields', () => {
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

  it('all errors collected for empty input', async () => {
    const result = await deserialize(ManyFieldsDto, {});
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
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
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Deeply nested DTO (10+ levels)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — deeply nested DTO (10+ levels)', () => {
  class L10 { @Field(isString) v!: string; }
  class L9 { @Field({ type: () => L10 }) c!: L10; }
  class L8 { @Field({ type: () => L9 }) c!: L9; }
  class L7 { @Field({ type: () => L8 }) c!: L8; }
  class L6 { @Field({ type: () => L7 }) c!: L7; }
  class L5 { @Field({ type: () => L6 }) c!: L6; }
  class L4 { @Field({ type: () => L5 }) c!: L5; }
  class L3 { @Field({ type: () => L4 }) c!: L4; }
  class L2 { @Field({ type: () => L3 }) c!: L3; }
  class L1 { @Field({ type: () => L2 }) c!: L2; }
  class Root { @Field({ type: () => L1 }) c!: L1; }

  it('no stack overflow on 11-level nesting', async () => {
    const input = { c: { c: { c: { c: { c: { c: { c: { c: { c: { c: { v: 'deep' } } } } } } } } } } };
    const result = await deserialize<Root>(Root, input) as Root;
    expect(result.c.c.c.c.c.c.c.c.c.c.v).toBe('deep');
  });

  it('validation error at deepest level has correct path', async () => {
    const input = { c: { c: { c: { c: { c: { c: { c: { c: { c: { c: { v: 123 } } } } } } } } } } };
    const result = await deserialize(Root, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.path).toBe('c.c.c.c.c.c.c.c.c.c.v');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 1000+ fields DTO (dynamic definition)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — 1000+ fields DTO', () => {
  class BigDto {}
  for (let i = 0; i < 1000; i++) {
    Field(isNumber())(BigDto.prototype, `f${i}`);
  }

  it('all 1000 fields validate correctly', async () => {
    const input: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) input[`f${i}`] = i;
    const result = await deserialize<any>(BigDto, input);
    expect(isBakerError(result)).toBe(false);
    expect((result as any).f0).toBe(0);
    expect((result as any).f999).toBe(999);
  });

  it('all 1000 fields report errors on invalid input', async () => {
    const input: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) input[`f${i}`] = 'bad';
    const result = await deserialize(BigDto, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBe(1000);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Circular reference DTO with circular input
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — circular reference detection', () => {
  class TreeNode {
    @Field(isString) value!: string;
    @Field({ optional: true, type: () => TreeNode }) child?: TreeNode;
  }

  it('actual circular input detected', async () => {
    const obj: any = { value: 'a', child: { value: 'b' } };
    obj.child.child = obj;
    const result = await deserialize(TreeNode, obj);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'circular')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Same DTO deserialized 10000 times in a loop
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — 10000 deserializations', () => {
  class SimpleDto {
    @Field(isString) name!: string;
    @Field(isNumber()) age!: number;
  }

  it('no memory leak and all results valid', async () => {
    const input = { name: 'test', age: 25 };
    for (let i = 0; i < 10_000; i++) {
      const result = await deserialize<SimpleDto>(SimpleDto, input) as SimpleDto;
      if (i % 1000 === 0) {
        expect(result.name).toBe('test');
        expect(result.age).toBe(25);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Concurrent deserialize calls (Promise.all with 100)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — concurrent deserialize calls', () => {
  class ConcurrentDto {
    @Field(isString) id!: string;
    @Field(isNumber()) val!: number;
  }

  it('100 concurrent calls all resolve correctly', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      deserialize<ConcurrentDto>(ConcurrentDto, { id: `item-${i}`, val: i })
    );
    const results = await Promise.all(promises);
    for (let i = 0; i < 100; i++) {
      expect(isBakerError(results[i])).toBe(false);
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
  class KitchenSinkDto {
    @Field(isString, minLength(5), maxLength(100), matches(/\w+/), contains('@'), isEmail())
    email!: string;
  }

  it('valid value passes all rules', async () => {
    const result = await deserialize<KitchenSinkDto>(KitchenSinkDto, { email: 'longuser@example.com' }) as KitchenSinkDto;
    expect(result.email).toBe('longuser@example.com');
  });

  it('short string fails minLength among other rules', async () => {
    const result = await deserialize(KitchenSinkDto, { email: 'a@b' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'minLength')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Extremely long string (100KB)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — extremely long string (100KB)', () => {
  class LongStringDto {
    @Field(isString) content!: string;
  }

  it('100KB string passes isString', async () => {
    const longStr = 'x'.repeat(100_000);
    const result = await deserialize<LongStringDto>(LongStringDto, { content: longStr }) as LongStringDto;
    expect(result.content).toHaveLength(100_000);
  });

  it('100KB string fails minLength if too short constraint not met', async () => {
    class D { @Field(isString, minLength(200_000)) v!: string; }
    const result = await deserialize(D, { v: 'x'.repeat(100_000) });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'minLength')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Extremely large number (MAX_SAFE_INTEGER + 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — extremely large number', () => {
  class NumberDto {
    @Field(isNumber()) val!: number;
  }

  it('MAX_SAFE_INTEGER passes isNumber', async () => {
    const result = await deserialize<NumberDto>(NumberDto, { val: Number.MAX_SAFE_INTEGER }) as NumberDto;
    expect(result.val).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('MAX_SAFE_INTEGER + 1 still passes isNumber (it is a valid number)', async () => {
    const result = await deserialize<NumberDto>(NumberDto, { val: Number.MAX_SAFE_INTEGER + 1 }) as NumberDto;
    expect(result.val).toBe(Number.MAX_SAFE_INTEGER + 1);
  });

  it('NaN fails isNumber by default', async () => {
    const result = await deserialize(NumberDto, { val: NaN });
    expect(isBakerError(result)).toBe(true);
  });

  it('Infinity fails isNumber by default', async () => {
    const result = await deserialize(NumberDto, { val: Infinity });
    expect(isBakerError(result)).toBe(true);
  });

  it('-Infinity fails isNumber by default', async () => {
    const result = await deserialize(NumberDto, { val: -Infinity });
    expect(isBakerError(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. null, undefined, NaN, Infinity, -Infinity, '', 0, false as inputs
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — special values as top-level input', () => {
  class Dto { @Field(isString) v!: string; }

  it('null input produces error', async () => {
    const result = await deserialize(Dto, null);
    expect(isBakerError(result)).toBe(true);
  });

  it('undefined input produces error', async () => {
    const result = await deserialize(Dto, undefined);
    expect(isBakerError(result)).toBe(true);
  });

  it('NaN input produces error', async () => {
    const result = await deserialize(Dto, NaN);
    expect(isBakerError(result)).toBe(true);
  });

  it('Infinity input produces error', async () => {
    const result = await deserialize(Dto, Infinity);
    expect(isBakerError(result)).toBe(true);
  });

  it('-Infinity input produces error', async () => {
    const result = await deserialize(Dto, -Infinity);
    expect(isBakerError(result)).toBe(true);
  });

  it('empty string input produces error', async () => {
    const result = await deserialize(Dto, '');
    expect(isBakerError(result)).toBe(true);
  });

  it('0 input produces error', async () => {
    const result = await deserialize(Dto, 0);
    expect(isBakerError(result)).toBe(true);
  });

  it('false input produces error', async () => {
    const result = await deserialize(Dto, false);
    expect(isBakerError(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Prototype pollution attempt
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — prototype pollution attempt', () => {
  class SafeDto {
    @Field(isString) name!: string;
  }

  it('__proto__ key does not pollute result', async () => {
    const malicious = JSON.parse('{"name":"ok","__proto__":{"polluted":true}}');
    const result = await deserialize<any>(SafeDto, malicious);
    if (!isBakerError(result)) {
      expect(result.name).toBe('ok');
      expect((result as any).polluted).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();
    }
  });

  it('constructor key does not pollute result', async () => {
    const malicious = JSON.parse('{"name":"ok","constructor":{"prototype":{"polluted":true}}}');
    const result = await deserialize<any>(SafeDto, malicious);
    if (!isBakerError(result)) {
      expect(result.name).toBe('ok');
      expect(({} as any).polluted).toBeUndefined();
    }
  });

  it('forbidUnknown mode rejects __proto__ and constructor', async () => {
    configure({ forbidUnknown: true });
    const malicious = JSON.parse('{"name":"ok","__proto__":{"p":true},"constructor":{}}');
    const result = await deserialize(SafeDto, malicious);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(e => e.code === 'whitelistViolation')).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. DTO with async transform that takes time
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — async transform with delay', () => {
  class AsyncDelayDto {
    @Field(isString, {
      transform: async ({ value }) => {
        await new Promise(r => setTimeout(r, 10));
        return typeof value === 'string' ? value.toUpperCase() : value;
      },
    })
    name!: string;
  }

  it('async transform with delay still resolves', async () => {
    const result = await deserialize<AsyncDelayDto>(AsyncDelayDto, { name: 'hello' }) as AsyncDelayDto;
    expect(result.name).toBe('HELLO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. validate with 100 rules on single value
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — validate with 100 rules on single value', () => {
  it('all 100 rules checked', async () => {
    const rules = Array.from({ length: 100 }, (_, i) =>
      createRule(`rule${i}`, (v) => typeof v === 'string')
    );
    const result = await validate('hello', ...rules);
    expect(result).toBe(true);
  });

  it('failing rules among 100 all reported', async () => {
    const rules = Array.from({ length: 100 }, (_, i) =>
      createRule(`rule${i}`, (v) => i < 50 ? typeof v === 'string' : false)
    );
    const result = await validate('hello', ...rules);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.length).toBe(50);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Deserialize then serialize roundtrip
// ─────────────────────────────────────────────────────────────────────────────

describe('chaos — deserialize then serialize roundtrip', () => {
  class AddressDto {
    @Field(isString) city!: string;
    @Field(isString) zip!: string;
  }

  class ProfileDto {
    @Field(isString, { name: 'full_name' }) fullName!: string;
    @Field(isNumber(), min(0)) age!: number;
    @Field(isBoolean) active!: boolean;
    @Field({ type: () => AddressDto }) address!: AddressDto;
    @Field(isString, { optional: true, nullable: true }) bio?: string | null;
    @Field({ type: () => [AddressDto] }) addresses!: AddressDto[];
  }

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
    const obj = await deserialize<ProfileDto>(ProfileDto, input) as ProfileDto;
    expect(obj.fullName).toBe('Alice');
    expect(obj.age).toBe(30);
    expect(obj.active).toBe(true);
    expect(obj.address.city).toBe('Seoul');

    const plain = await serialize(obj);
    expect(plain['full_name']).toBe('Alice');
    expect(plain['age']).toBe(30);
    expect(plain['active']).toBe(true);

    const obj2 = await deserialize<ProfileDto>(ProfileDto, plain) as ProfileDto;
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
    const obj = await deserialize<ProfileDto>(ProfileDto, input) as ProfileDto;
    expect(obj.bio).toBeNull();

    const plain = await serialize(obj);
    const obj2 = await deserialize<ProfileDto>(ProfileDto, plain) as ProfileDto;
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
    const obj = await deserialize<ProfileDto>(ProfileDto, input) as ProfileDto;
    expect(obj.bio).toBeUndefined();

    const plain = await serialize(obj);
    const obj2 = await deserialize<ProfileDto>(ProfileDto, plain) as ProfileDto;
    expect(obj2.bio).toBeUndefined();
  });
});
