import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import {
  deserialize, configure, isBakerError,
  Field,
} from '../../index';
import type { BakerErrors } from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());

// ─── __proto__, constructor key injection (forbidUnknown mode) ───────────────

describe('prototype pollution defense (forbidUnknown)', () => {
  class SafeDto {
    @Field(isString) name!: string;
  }

  it('__proto__ key → pollution prevented', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize<any>(SafeDto, { name: 'ok', __proto__: { admin: true } });
    if (isBakerError(result)) {
      expect(result.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    } else {
      expect(result.admin).toBeUndefined();
    }
  });

  it('constructor key → whitelistViolation rejected', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize(SafeDto, JSON.parse('{"name":"ok","constructor":{"prototype":{"admin":true}}}'));
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('toString key → whitelistViolation rejected', async () => {
    configure({ forbidUnknown: true });
    const result = await deserialize(SafeDto, { name: 'ok', toString: 'evil' });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });
});

// ─── extra keys ignored without forbidUnknown ──────────────────────────────

describe('extra keys ignored without forbidUnknown', () => {
  class Dto { @Field(isString) name!: string; }

  it('undeclared keys not included in result', async () => {
    const r = await deserialize<any>(Dto, { name: 'ok', extra: 'should-be-ignored', __proto__: {} }) as any;
    expect(r.name).toBe('ok');
    expect(r.extra).toBeUndefined();
  });
});

// ─── deeply nested objects (stack safety) ──────────────────────────────────

describe('deeply nested objects stack safety', () => {
  class Leaf {
    @Field(isString) value!: string;
  }

  class Level5 { @Field({ type: () => Leaf }) leaf!: Leaf; }
  class Level4 { @Field({ type: () => Level5 }) child!: Level5; }
  class Level3 { @Field({ type: () => Level4 }) child!: Level4; }
  class Level2 { @Field({ type: () => Level3 }) child!: Level3; }
  class Level1 { @Field({ type: () => Level2 }) child!: Level2; }

  it('5 levels of nesting processed correctly', async () => {
    const input = {
      child: { child: { child: { child: { leaf: { value: 'deep' } } } } },
    };
    const r = await deserialize<Level1>(Level1, input) as Level1;
    expect(r.child.child.child.child.leaf.value).toBe('deep');
  });

  it('5 levels of nesting validation failure → correct path', async () => {
    const input = {
      child: { child: { child: { child: { leaf: { value: 123 } } } } },
    };
    const result = await deserialize(Level1, input);
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      expect(result.errors[0]!.path).toBe('child.child.child.child.leaf.value');
      expect(result.errors[0]!.code).toBe('isString');
    }
  });
});

// ─── large array input handling ─────────────────────────────────────────────

describe('large array input handling', () => {
  class ItemDto {
    @Field(isNumber()) id!: number;
  }

  class ListDto {
    @Field({ type: () => [ItemDto] })
    items!: ItemDto[];
  }

  it('1000 item array processed correctly', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const r = await deserialize<ListDto>(ListDto, { items }) as ListDto;
    expect(r.items).toHaveLength(1000);
    expect(r.items[999]!.id).toBe(999);
  });

  it('some invalid among 1000 → only those indices have errors', async () => {
    const items: any[] = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    items[50] = { id: 'bad' };
    items[99] = { id: 'bad' };
    const result = await deserialize(ListDto, { items });
    expect(isBakerError(result)).toBe(true);
    if (isBakerError(result)) {
      const paths = result.errors.map(x => x.path);
      expect(paths).toContain('items[50].id');
      expect(paths).toContain('items[99].id');
      expect(paths.filter(p => p === 'items[0].id')).toHaveLength(0);
    }
  });
});

// ─── special string key handling ────────────────────────────────────────────

// ─── E-26: frozen / null-prototype input ────────────────────────────────────

describe('E-26: frozen / null-prototype input', () => {
  class FrozenDto {
    @Field(isString) name!: string;
    @Field(isNumber()) age!: number;
  }

  it('Object.freeze() input → deserialize works', async () => {
    const input = Object.freeze({ name: 'test', age: 25 });
    const r = await deserialize<FrozenDto>(FrozenDto, input) as FrozenDto;
    expect(r.name).toBe('test');
    expect(r.age).toBe(25);
    expect(r).toBeInstanceOf(FrozenDto);
  });

  it('Object.create(null) input → deserialize works', async () => {
    const input = Object.create(null);
    Object.defineProperty(input, 'name', { value: 'test', enumerable: true });
    Object.defineProperty(input, 'age', { value: 25, enumerable: true });
    const r = await deserialize<FrozenDto>(FrozenDto, input) as FrozenDto;
    expect(r.name).toBe('test');
    expect(r.age).toBe(25);
    expect(r).toBeInstanceOf(FrozenDto);
  });

  it('frozen input with invalid value → BakerErrors returned', async () => {
    const input = Object.freeze({ name: 123, age: 25 });
    const result = await deserialize(FrozenDto, input);
    expect(isBakerError(result)).toBe(true);
  });
});

describe('special string value handling', () => {
  class Dto { @Field(isString) v!: string; }

  it('very long string (10K) passes', async () => {
    const longStr = 'x'.repeat(10_000);
    const r = await deserialize<any>(Dto, { v: longStr }) as any;
    expect(r.v).toHaveLength(10_000);
  });

  it('unicode emoji string passes', async () => {
    const r = await deserialize<any>(Dto, { v: '🎉🎊🎈' }) as any;
    expect(r.v).toBe('🎉🎊🎈');
  });

  it('string containing null byte passes', async () => {
    const r = await deserialize<any>(Dto, { v: 'hello\x00world' }) as any;
    expect(r.v).toBe('hello\x00world');
  });
});
