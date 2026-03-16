import { describe, it, expect, afterEach } from 'bun:test';
import {
  deserialize, configure, BakerValidationError,
  Field,
} from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─── __proto__, constructor key injection (forbidUnknown mode) ───────────────

describe('prototype pollution defense (forbidUnknown)', () => {
  class SafeDto {
    @Field(isString) name!: string;
  }

  it('__proto__ key → pollution prevented', async () => {
    configure({ forbidUnknown: true });
    try {
      const result = await deserialize<any>(SafeDto, { name: 'ok', __proto__: { admin: true } });
      // __proto__ ignored by Object.prototype → result should not have admin
      expect(result.admin).toBeUndefined();
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('constructor key → whitelistViolation rejected', async () => {
    configure({ forbidUnknown: true });
    try {
      await deserialize(SafeDto, JSON.parse('{"name":"ok","constructor":{"prototype":{"admin":true}}}'));
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('toString key → whitelistViolation rejected', async () => {
    configure({ forbidUnknown: true });
    try {
      await deserialize(SafeDto, { name: 'ok', toString: 'evil' });
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });
});

// ─── extra keys ignored without forbidUnknown ──────────────────────────────

describe('extra keys ignored without forbidUnknown', () => {
  class Dto { @Field(isString) name!: string; }

  it('undeclared keys not included in result', async () => {
    const r = await deserialize<any>(Dto, { name: 'ok', extra: 'should-be-ignored', __proto__: {} });
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
    const r = await deserialize<Level1>(Level1, input);
    expect(r.child.child.child.child.leaf.value).toBe('deep');
  });

  it('5 levels of nesting validation failure → correct path', async () => {
    const input = {
      child: { child: { child: { child: { leaf: { value: 123 } } } } },
    };
    try {
      await deserialize(Level1, input);
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.errors[0]!.path).toBe('child.child.child.child.leaf.value');
      expect(e.errors[0]!.code).toBe('isString');
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
    const r = await deserialize<ListDto>(ListDto, { items });
    expect(r.items).toHaveLength(1000);
    expect(r.items[999]!.id).toBe(999);
  });

  it('some invalid among 1000 → only those indices have errors', async () => {
    const items: any[] = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    items[50] = { id: 'bad' };
    items[99] = { id: 'bad' };
    try {
      await deserialize(ListDto, { items });
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      const paths = e.errors.map(x => x.path);
      expect(paths).toContain('items[50].id');
      expect(paths).toContain('items[99].id');
      // valid items should not have errors
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
    const r = await deserialize<FrozenDto>(FrozenDto, input);
    expect(r.name).toBe('test');
    expect(r.age).toBe(25);
    expect(r).toBeInstanceOf(FrozenDto);
  });

  it('Object.create(null) input → deserialize works', async () => {
    const input = Object.create(null);
    Object.defineProperty(input, 'name', { value: 'test', enumerable: true });
    Object.defineProperty(input, 'age', { value: 25, enumerable: true });
    const r = await deserialize<FrozenDto>(FrozenDto, input);
    expect(r.name).toBe('test');
    expect(r.age).toBe(25);
    expect(r).toBeInstanceOf(FrozenDto);
  });

  it('frozen input with invalid value → validation error still thrown', async () => {
    const input = Object.freeze({ name: 123, age: 25 });
    await expect(deserialize(FrozenDto, input)).rejects.toThrow(BakerValidationError);
  });
});

describe('special string value handling', () => {
  class Dto { @Field(isString) v!: string; }

  it('very long string (10K) passes', async () => {
    const longStr = 'x'.repeat(10_000);
    const r = await deserialize<any>(Dto, { v: longStr });
    expect(r.v).toHaveLength(10_000);
  });

  it('unicode emoji string passes', async () => {
    const r = await deserialize<any>(Dto, { v: '🎉🎊🎈' });
    expect(r.v).toBe('🎉🎊🎈');
  });

  it('string containing null byte passes', async () => {
    const r = await deserialize<any>(Dto, { v: 'hello\x00world' });
    expect(r.v).toBe('hello\x00world');
  });
});
