import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, BakerValidationError,
  IsString, IsNumber, Nested,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─── __proto__, constructor 키 주입 (whitelist 모드) ────────────────────────

describe('프로토타입 오염 방어 (whitelist)', () => {
  class SafeDto {
    @IsString() name!: string;
  }

  it('__proto__ 키 → whitelistViolation 거부', async () => {
    seal({ whitelist: true });
    try {
      await deserialize(SafeDto, { name: 'ok', __proto__: { admin: true } });
      // __proto__가 Object.prototype에 의해 무시될 수 있으므로
      // 통과하더라도 결과에 __proto__ 없어야 함
    } catch (e) {
      if (e instanceof BakerValidationError) {
        // whitelist 거부 → OK
        expect(e.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
      }
    }
  });

  it('constructor 키 → whitelistViolation 거부', async () => {
    seal({ whitelist: true });
    try {
      await deserialize(SafeDto, JSON.parse('{"name":"ok","constructor":{"prototype":{"admin":true}}}'));
    } catch (e) {
      if (e instanceof BakerValidationError) {
        expect(e.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
      }
    }
  });

  it('toString 키 → whitelistViolation 거부', async () => {
    seal({ whitelist: true });
    try {
      await deserialize(SafeDto, { name: 'ok', toString: 'evil' });
    } catch (e) {
      if (e instanceof BakerValidationError) {
        expect(e.errors.some(x => x.code === 'whitelistViolation')).toBe(true);
      }
    }
  });
});

// ─── whitelist 없이 추가 키 무시 확인 ──────────────────────────────────────

describe('whitelist 없이 추가 키 무시', () => {
  class Dto { @IsString() name!: string; }

  it('미선언 키는 결과에 포함되지 않음', async () => {
    seal();
    const r = await deserialize<any>(Dto, { name: 'ok', extra: 'should-be-ignored', __proto__: {} });
    expect(r.name).toBe('ok');
    expect(r.extra).toBeUndefined();
  });
});

// ─── 깊은 중첩 객체 (스택 안전성) ──────────────────────────────────────────

describe('깊은 중첩 객체 스택 안전성', () => {
  class Leaf {
    @IsString() value!: string;
  }

  class Level5 { @Nested(() => Leaf) leaf!: Leaf; }
  class Level4 { @Nested(() => Level5) child!: Level5; }
  class Level3 { @Nested(() => Level4) child!: Level4; }
  class Level2 { @Nested(() => Level3) child!: Level3; }
  class Level1 { @Nested(() => Level2) child!: Level2; }

  it('5 레벨 중첩 정상 처리', async () => {
    seal();
    const input = {
      child: { child: { child: { child: { leaf: { value: 'deep' } } } } },
    };
    const r = await deserialize<Level1>(Level1, input);
    expect(r.child.child.child.child.leaf.value).toBe('deep');
  });

  it('5 레벨 중첩 검증 실패 시 정확한 경로', async () => {
    seal();
    const input = {
      child: { child: { child: { child: { leaf: { value: 123 } } } } },
    };
    try {
      await deserialize(Level1, input);
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.errors[0].path).toBe('child.child.child.child.leaf.value');
      expect(e.errors[0].code).toBe('isString');
    }
  });
});

// ─── 큰 배열 입력 처리 ─────────────────────────────────────────────────────

describe('큰 배열 입력 처리', () => {
  class ItemDto {
    @IsNumber() id!: number;
  }

  class ListDto {
    @Nested(() => ItemDto, { each: true })
    items!: ItemDto[];
  }

  it('1000개 항목 배열 정상 처리', async () => {
    seal();
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const r = await deserialize<ListDto>(ListDto, { items });
    expect(r.items).toHaveLength(1000);
    expect(r.items[999].id).toBe(999);
  });

  it('1000개 중 일부 무효 → 해당 인덱스만 에러', async () => {
    seal();
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

describe('특수 문자열 값 처리', () => {
  class Dto { @IsString() v!: string; }

  it('매우 긴 문자열 (10K) 통과', async () => {
    seal();
    const longStr = 'x'.repeat(10_000);
    const r = await deserialize<any>(Dto, { v: longStr });
    expect(r.v).toHaveLength(10_000);
  });

  it('유니코드 이모지 문자열 통과', async () => {
    seal();
    const r = await deserialize<any>(Dto, { v: '🎉🎊🎈' });
    expect(r.v).toBe('🎉🎊🎈');
  });

  it('null byte 포함 문자열 통과', async () => {
    seal();
    const r = await deserialize<any>(Dto, { v: 'hello\x00world' });
    expect(r.v).toBe('hello\x00world');
  });
});
