import { describe, it, expect } from 'bun:test';

import { Baker, isBakerIssueSet, Field } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { assertBakerIssueSet, assertNotBakerIssueSet } from '../integration/helpers/assert';

/**
 * Asserts that prototype-pollution input was either rejected (BakerIssue with
 * `expectedCode`) OR succeeded without polluting the result with `admin`.
 *
 * Lives at module scope so the branching `if` is outside any `it()` body.
 */
function expectProtoPollutionPrevented(result: unknown, expectedCode: string): void {
  if (isBakerIssueSet(result)) {
    expect(result.errors.some(x => x.code === expectedCode)).toBe(true);
    return;
  }
  expect((result as { admin?: unknown }).admin).toBeUndefined();
}

// ─── __proto__, constructor key injection (forbidUnknown mode) ───────────────

describe('prototype pollution defense (forbidUnknown)', () => {
  const baker = new Baker({ forbidUnknown: true });

  @baker.Recipe
  class SafeDto {
    @Field(isString) name!: string;
  }

  baker.seal();

  it('__proto__ key → pollution prevented', async () => {
    const result = await baker.deserialize<SafeDto>(SafeDto, { name: 'ok', __proto__: { admin: true } });
    expectProtoPollutionPrevented(result, 'whitelistViolation');
  });

  it('constructor key → whitelistViolation rejected', async () => {
    const result = await baker.deserialize(SafeDto, JSON.parse('{"name":"ok","constructor":{"prototype":{"admin":true}}}'));
    assertBakerIssueSet(result);
    expect(result.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
  });

  it('toString key → whitelistViolation rejected', async () => {
    const result = await baker.deserialize(SafeDto, { name: 'ok', toString: 'evil' });
    assertBakerIssueSet(result);
    expect(result.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
  });
});

// ─── extra keys ignored without forbidUnknown ──────────────────────────────

describe('extra keys ignored without forbidUnknown', () => {
  const baker = new Baker();

  @baker.Recipe
  class Dto {
    @Field(isString) name!: string;
  }

  baker.seal();

  it('undeclared keys not included in result', async () => {
    const r = await baker.deserialize<Dto>(Dto, { name: 'ok', extra: 'should-be-ignored', __proto__: {} });
    assertNotBakerIssueSet(r);
    expect(r.name).toBe('ok');
    expect((r as Dto & { extra?: unknown }).extra).toBeUndefined();
  });
});

// ─── deeply nested objects (stack safety) ──────────────────────────────────

describe('deeply nested objects stack safety', () => {
  const baker = new Baker();

  @baker.Recipe
  class Leaf {
    @Field(isString) value!: string;
  }

  @baker.Recipe
  class Level5 {
    @Field({ type: () => Leaf }) leaf!: Leaf;
  }
  @baker.Recipe
  class Level4 {
    @Field({ type: () => Level5 }) child!: Level5;
  }
  @baker.Recipe
  class Level3 {
    @Field({ type: () => Level4 }) child!: Level4;
  }
  @baker.Recipe
  class Level2 {
    @Field({ type: () => Level3 }) child!: Level3;
  }
  @baker.Recipe
  class Level1 {
    @Field({ type: () => Level2 }) child!: Level2;
  }

  baker.seal();

  it('5 levels of nesting processed correctly', async () => {
    const input = {
      child: { child: { child: { child: { leaf: { value: 'deep' } } } } },
    };
    const r = (await baker.deserialize<Level1>(Level1, input)) as Level1;
    expect(r.child.child.child.child.leaf.value).toBe('deep');
  });

  it('5 levels of nesting validation failure → correct path', async () => {
    const input = {
      child: { child: { child: { child: { leaf: { value: 123 } } } } },
    };
    const result = await baker.deserialize(Level1, input);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.path).toBe('child.child.child.child.leaf.value');
    expect(result.errors[0]!.code).toBe('isString');
  });
});

// ─── large array input handling ─────────────────────────────────────────────

describe('large array input handling', () => {
  const baker = new Baker();

  @baker.Recipe
  class ItemDto {
    @Field(isNumber()) id!: number;
  }

  @baker.Recipe
  class ListDto {
    @Field({ type: () => [ItemDto] })
    items!: ItemDto[];
  }

  baker.seal();

  it('1000 item array processed correctly', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const r = (await baker.deserialize<ListDto>(ListDto, { items })) as ListDto;
    expect(r.items).toHaveLength(1000);
    expect(r.items[999]!.id).toBe(999);
  });

  it('some invalid among 1000 → only those indices have errors', async () => {
    const items: Array<{ id: number | string }> = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    items[50] = { id: 'bad' };
    items[99] = { id: 'bad' };
    const result = await baker.deserialize(ListDto, { items });
    assertBakerIssueSet(result);
    const paths = result.errors.map(x => x.path);
    expect(paths).toContain('items[50].id');
    expect(paths).toContain('items[99].id');
    expect(paths.filter(p => p === 'items[0].id')).toHaveLength(0);
  });
});

// ─── special string key handling ────────────────────────────────────────────

// ─── E-26: frozen / null-prototype input ────────────────────────────────────

describe('E-26: frozen / null-prototype input', () => {
  const baker = new Baker();

  @baker.Recipe
  class FrozenDto {
    @Field(isString) name!: string;
    @Field(isNumber()) age!: number;
  }

  baker.seal();

  it('Object.freeze() input → deserialize works', async () => {
    const input = Object.freeze({ name: 'test', age: 25 });
    const r = (await baker.deserialize<FrozenDto>(FrozenDto, input)) as FrozenDto;
    expect(r.name).toBe('test');
    expect(r.age).toBe(25);
    expect(r).toBeInstanceOf(FrozenDto);
  });

  it('Object.create(null) input → deserialize works', async () => {
    const input = Object.create(null);
    Object.defineProperty(input, 'name', { value: 'test', enumerable: true });
    Object.defineProperty(input, 'age', { value: 25, enumerable: true });
    const r = (await baker.deserialize<FrozenDto>(FrozenDto, input)) as FrozenDto;
    expect(r.name).toBe('test');
    expect(r.age).toBe(25);
    expect(r).toBeInstanceOf(FrozenDto);
  });

  it('frozen input with invalid value → BakerIssueSet returned', async () => {
    const input = Object.freeze({ name: 123, age: 25 });
    const result = await baker.deserialize(FrozenDto, input);
    expect(isBakerIssueSet(result)).toBe(true);
  });
});

describe('special string value handling', () => {
  const baker = new Baker();

  @baker.Recipe
  class Dto {
    @Field(isString) v!: string;
  }

  baker.seal();

  it('very long string (10K) passes', async () => {
    const longStr = 'x'.repeat(10_000);
    const r = await baker.deserialize<Dto>(Dto, { v: longStr });
    assertNotBakerIssueSet(r);
    expect(r.v).toHaveLength(10_000);
  });

  it('unicode emoji string passes', async () => {
    const r = await baker.deserialize<Dto>(Dto, { v: '🎉🎊🎈' });
    assertNotBakerIssueSet(r);
    expect(r.v).toBe('🎉🎊🎈');
  });

  it('string containing null byte passes', async () => {
    const r = await baker.deserialize<Dto>(Dto, { v: 'hello\x00world' });
    assertNotBakerIssueSet(r);
    expect(r.v).toBe('hello\x00world');
  });
});
