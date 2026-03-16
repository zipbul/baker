import { describe, it, expect, afterEach } from 'bun:test';
import {
  deserialize, configure, BakerValidationError,
  Field,
} from '../../index';
import { isString, isNumber } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─── __proto__, constructor 키 주입 (forbidUnknown 모드) ──────────────────────

describe('프로토타입 오염 방어 (forbidUnknown)', () => {
  class SafeDto {
    @Field(isString) name!: string;
  }

  it('__proto__ 키 → 오염 방지', async () => {
    configure({ forbidUnknown: true });
    try {
      const result = await deserialize<any>(SafeDto, { name: 'ok', __proto__: { admin: true } });
      // __proto__가 Object.prototype에 의해 무시 → 결과에 admin 없어야 함
      expect(result.admin).toBeUndefined();
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('constructor 키 → whitelistViolation 거부', async () => {
    configure({ forbidUnknown: true });
    try {
      await deserialize(SafeDto, JSON.parse('{"name":"ok","constructor":{"prototype":{"admin":true}}}'));
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
    }
  });

  it('toString 키 → whitelistViolation 거부', async () => {
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

// ─── forbidUnknown 없이 추가 키 무시 확인 ──────────────────────────────────────

describe('forbidUnknown 없이 추가 키 무시', () => {
  class Dto { @Field(isString) name!: string; }

  it('미선언 키는 결과에 포함되지 않음', async () => {
    const r = await deserialize<any>(Dto, { name: 'ok', extra: 'should-be-ignored', __proto__: {} });
    expect(r.name).toBe('ok');
    expect(r.extra).toBeUndefined();
  });
});

// ─── 깊은 중첩 객체 (스택 안전성) ──────────────────────────────────────────

describe('깊은 중첩 객체 스택 안전성', () => {
  class Leaf {
    @Field(isString) value!: string;
  }

  class Level5 { @Field({ type: () => Leaf }) leaf!: Leaf; }
  class Level4 { @Field({ type: () => Level5 }) child!: Level5; }
  class Level3 { @Field({ type: () => Level4 }) child!: Level4; }
  class Level2 { @Field({ type: () => Level3 }) child!: Level3; }
  class Level1 { @Field({ type: () => Level2 }) child!: Level2; }

  it('5 레벨 중첩 정상 처리', async () => {
    const input = {
      child: { child: { child: { child: { leaf: { value: 'deep' } } } } },
    };
    const r = await deserialize<Level1>(Level1, input);
    expect(r.child.child.child.child.leaf.value).toBe('deep');
  });

  it('5 레벨 중첩 검증 실패 시 정확한 경로', async () => {
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

// ─── 큰 배열 입력 처리 ─────────────────────────────────────────────────────

describe('큰 배열 입력 처리', () => {
  class ItemDto {
    @Field(isNumber()) id!: number;
  }

  class ListDto {
    @Field({ type: () => [ItemDto] })
    items!: ItemDto[];
  }

  it('1000개 항목 배열 정상 처리', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const r = await deserialize<ListDto>(ListDto, { items });
    expect(r.items).toHaveLength(1000);
    expect(r.items[999]!.id).toBe(999);
  });

  it('1000개 중 일부 무효 → 해당 인덱스만 에러', async () => {
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
      // 유효 항목은 에러에 없어야 함
      expect(paths.filter(p => p === 'items[0].id')).toHaveLength(0);
    }
  });
});

// ─── 특수 문자열 키 처리 ───────────────────────────────────────────────────

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

describe('특수 문자열 값 처리', () => {
  class Dto { @Field(isString) v!: string; }

  it('매우 긴 문자열 (10K) 통과', async () => {
    const longStr = 'x'.repeat(10_000);
    const r = await deserialize<any>(Dto, { v: longStr });
    expect(r.v).toHaveLength(10_000);
  });

  it('유니코드 이모지 문자열 통과', async () => {
    const r = await deserialize<any>(Dto, { v: '🎉🎊🎈' });
    expect(r.v).toBe('🎉🎊🎈');
  });

  it('null byte 포함 문자열 통과', async () => {
    const r = await deserialize<any>(Dto, { v: 'hello\x00world' });
    expect(r.v).toBe('hello\x00world');
  });
});
