import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { deserialize, configure, isBakerError, Field, Recipe, seal } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { assertBakerError, assertNotBakerError } from '../integration/helpers/assert';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

/**
 * Asserts that prototype-pollution input was either rejected (BakerError with
 * `expectedCode`) OR succeeded without polluting the result with `admin`.
 *
 * Lives at module scope so the branching `if` is outside any `it()` body.
 */
function expectProtoPollutionPrevented(result: unknown, expectedCode: string): void {
  if (isBakerError(result)) {
    expect(result.errors.some(x => x.code === expectedCode)).toBe(true);
    return;
  }
  expect((result as { admin?: unknown }).admin).toBeUndefined();
}

// ─── __proto__, constructor key injection (forbidUnknown mode) ───────────────

describe('prototype pollution defense (forbidUnknown)', () => {
  @Recipe
  class SafeDto {
    @Field(isString) name!: string;
  }

  it('__proto__ key → pollution prevented', async () => {
    configure({ forbidUnknown: true });
    seal();
    const result = await deserialize<SafeDto>(SafeDto, { name: 'ok', __proto__: { admin: true } });
    expectProtoPollutionPrevented(result, 'whitelistViolation');
  });

  it('constructor key → whitelistViolation rejected', async () => {
    configure({ forbidUnknown: true });
    seal();
    const result = await deserialize(SafeDto, JSON.parse('{"name":"ok","constructor":{"prototype":{"admin":true}}}'));
    assertBakerError(result);
    expect(result.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
  });

  it('toString key → whitelistViolation rejected', async () => {
    configure({ forbidUnknown: true });
    seal();
    const result = await deserialize(SafeDto, { name: 'ok', toString: 'evil' });
    assertBakerError(result);
    expect(result.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
  });
});

// ─── extra keys ignored without forbidUnknown ──────────────────────────────

describe('extra keys ignored without forbidUnknown', () => {
  @Recipe
  class Dto {
    @Field(isString) name!: string;
  }

  it('undeclared keys not included in result', async () => {
    seal();
    const r = await deserialize<Dto>(Dto, { name: 'ok', extra: 'should-be-ignored', __proto__: {} });
    assertNotBakerError(r);
    expect(r.name).toBe('ok');
    expect((r as Dto & { extra?: unknown }).extra).toBeUndefined();
  });
});

// ─── deeply nested objects (stack safety) ──────────────────────────────────

describe('deeply nested objects stack safety', () => {
  @Recipe
  class Leaf {
    @Field(isString) value!: string;
  }

  @Recipe
  class Level5 {
    @Field({ type: () => Leaf }) leaf!: Leaf;
  }
  @Recipe
  class Level4 {
    @Field({ type: () => Level5 }) child!: Level5;
  }
  @Recipe
  class Level3 {
    @Field({ type: () => Level4 }) child!: Level4;
  }
  @Recipe
  class Level2 {
    @Field({ type: () => Level3 }) child!: Level3;
  }
  @Recipe
  class Level1 {
    @Field({ type: () => Level2 }) child!: Level2;
  }

  it('5 levels of nesting processed correctly', async () => {
    seal();
    const input = {
      child: { child: { child: { child: { leaf: { value: 'deep' } } } } },
    };
    const r = (await deserialize<Level1>(Level1, input)) as Level1;
    expect(r.child.child.child.child.leaf.value).toBe('deep');
  });

  it('5 levels of nesting validation failure → correct path', async () => {
    seal();
    const input = {
      child: { child: { child: { child: { leaf: { value: 123 } } } } },
    };
    const result = await deserialize(Level1, input);
    assertBakerError(result);
    expect(result.errors[0]!.path).toBe('child.child.child.child.leaf.value');
    expect(result.errors[0]!.code).toBe('isString');
  });
});

// ─── large array input handling ─────────────────────────────────────────────

describe('large array input handling', () => {
  @Recipe
  class ItemDto {
    @Field(isNumber()) id!: number;
  }

  @Recipe
  class ListDto {
    @Field({ type: () => [ItemDto] })
    items!: ItemDto[];
  }

  it('1000 item array processed correctly', async () => {
    seal();
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const r = (await deserialize<ListDto>(ListDto, { items })) as ListDto;
    expect(r.items).toHaveLength(1000);
    expect(r.items[999]!.id).toBe(999);
  });

  it('some invalid among 1000 → only those indices have errors', async () => {
    seal();
    const items: Array<{ id: number | string }> = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    items[50] = { id: 'bad' };
    items[99] = { id: 'bad' };
    const result = await deserialize(ListDto, { items });
    assertBakerError(result);
    const paths = result.errors.map(x => x.path);
    expect(paths).toContain('items[50].id');
    expect(paths).toContain('items[99].id');
    expect(paths.filter(p => p === 'items[0].id')).toHaveLength(0);
  });
});

// ─── special string key handling ────────────────────────────────────────────

// ─── E-26: frozen / null-prototype input ────────────────────────────────────

describe('E-26: frozen / null-prototype input', () => {
  @Recipe
  class FrozenDto {
    @Field(isString) name!: string;
    @Field(isNumber()) age!: number;
  }

  it('Object.freeze() input → deserialize works', async () => {
    seal();
    const input = Object.freeze({ name: 'test', age: 25 });
    const r = (await deserialize<FrozenDto>(FrozenDto, input)) as FrozenDto;
    expect(r.name).toBe('test');
    expect(r.age).toBe(25);
    expect(r).toBeInstanceOf(FrozenDto);
  });

  it('Object.create(null) input → deserialize works', async () => {
    seal();
    const input = Object.create(null);
    Object.defineProperty(input, 'name', { value: 'test', enumerable: true });
    Object.defineProperty(input, 'age', { value: 25, enumerable: true });
    const r = (await deserialize<FrozenDto>(FrozenDto, input)) as FrozenDto;
    expect(r.name).toBe('test');
    expect(r.age).toBe(25);
    expect(r).toBeInstanceOf(FrozenDto);
  });

  it('frozen input with invalid value → BakerErrors returned', async () => {
    seal();
    const input = Object.freeze({ name: 123, age: 25 });
    const result = await deserialize(FrozenDto, input);
    expect(isBakerError(result)).toBe(true);
  });
});

describe('special string value handling', () => {
  @Recipe
  class Dto {
    @Field(isString) v!: string;
  }

  it('very long string (10K) passes', async () => {
    seal();
    const longStr = 'x'.repeat(10_000);
    const r = await deserialize<Dto>(Dto, { v: longStr });
    assertNotBakerError(r);
    expect(r.v).toHaveLength(10_000);
  });

  it('unicode emoji string passes', async () => {
    seal();
    const r = await deserialize<Dto>(Dto, { v: '🎉🎊🎈' });
    assertNotBakerError(r);
    expect(r.v).toBe('🎉🎊🎈');
  });

  it('string containing null byte passes', async () => {
    seal();
    const r = await deserialize<Dto>(Dto, { v: 'hello\x00world' });
    assertNotBakerError(r);
    expect(r.v).toBe('hello\x00world');
  });
});
