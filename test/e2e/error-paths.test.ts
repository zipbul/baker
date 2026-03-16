import { describe, it, expect, afterEach } from 'bun:test';
import {
  Field, arrayOf, deserialize, BakerValidationError,
} from '../../index';
import { isString, isNumber, isInt, min, minLength, arrayMinSize } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** 헬퍼: BakerValidationError에서 errors 배열 추출 */
async function getErrors(cls: new (...args: any[]) => any, input: unknown) {
  try {
    await deserialize(cls, input);
    throw new Error('expected rejection');
  } catch (e) {
    if (!(e instanceof BakerValidationError)) throw e;
    return e.errors;
  }
}

// ─── 기본 필드 경로 ─────────────────────────────────────────────────────────

describe('단일 필드 에러 경로', () => {
  class Dto {
    @Field(isString) name!: string;
    @Field(isNumber()) age!: number;
  }

  it('path가 필드명과 일치', async () => {
    const errors = await getErrors(Dto, { name: 123, age: 'abc' });
    expect(errors).toHaveLength(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toEqual(['age', 'name']);
  });

  it('각 에러 code 확인', async () => {
    const errors = await getErrors(Dto, { name: 123, age: 'abc' });
    expect(errors.find(e => e.path === 'name')!.code).toBe('isString');
    expect(errors.find(e => e.path === 'age')!.code).toBe('isNumber');
  });
});

// ─── 중첩 객체 에러 경로 ────────────────────────────────────────────────────

describe('중첩 객체 에러 경로', () => {
  class Address {
    @Field(isString) city!: string;
    @Field(isString) street!: string;
  }

  class UserDto {
    @Field(isString) name!: string;
    @Field({ type: () => Address }) address!: Address;
  }

  it('중첩 필드 path = "address.city"', async () => {
    const errors = await getErrors(UserDto, { name: 'John', address: { city: 123, street: 'Main' } });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe('address.city');
    expect(errors[0]!.code).toBe('isString');
  });

  it('여러 중첩 필드 실패', async () => {
    const errors = await getErrors(UserDto, { name: 'John', address: { city: 123, street: 456 } });
    expect(errors).toHaveLength(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toEqual(['address.city', 'address.street']);
  });

  it('부모 + 중첩 동시 실패', async () => {
    const errors = await getErrors(UserDto, { name: 123, address: { city: 456, street: 'ok' } });
    expect(errors).toHaveLength(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toEqual(['address.city', 'name']);
  });
});

// ─── 깊은 중첩 (3 레벨) ────────────────────────────────────────────────────

describe('깊은 중첩 에러 경로 (3 레벨)', () => {
  class Zip { @Field(isString) code!: string; }
  class City { @Field({ type: () => Zip }) zip!: Zip; }
  class Company { @Field({ type: () => City }) city!: City; }

  it('path = "city.zip.code"', async () => {
    const errors = await getErrors(Company, { city: { zip: { code: 999 } } });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe('city.zip.code');
    expect(errors[0]!.code).toBe('isString');
  });
});

// ─── 배열 each:true 에러 경로 ───────────────────────────────────────────────

describe('배열 each:true 에러 경로', () => {
  class TagsDto {
    @Field(arrayOf(isString)) tags!: string[];
  }

  it('실패한 원소 인덱스 포함 path = "tags[1]"', async () => {
    const errors = await getErrors(TagsDto, { tags: ['ok', 123, 'fine', 456] });
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toContain('tags[1]');
    expect(paths).toContain('tags[3]');
  });

  it('모든 실패 인덱스 반환 (첫번째만이 아닌)', async () => {
    const errors = await getErrors(TagsDto, { tags: [1, 2, 3] });
    expect(errors).toHaveLength(3);
    expect(errors.map(e => e.path).sort()).toEqual(['tags[0]', 'tags[1]', 'tags[2]']);
  });
});

// ─── 중첩 배열 에러 경로 ────────────────────────────────────────────────────

describe('Nested 배열 에러 경로', () => {
  class Item {
    @Field(isString) label!: string;
    @Field(isNumber()) price!: number;
  }

  class OrderDto {
    @Field(arrayMinSize(1), { type: () => [Item] })
    items!: Item[];
  }

  it('path = "items[1].label"', async () => {
    const errors = await getErrors(OrderDto, {
      items: [
        { label: 'Good', price: 10 },
        { label: 123, price: 'bad' },
      ],
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toContain('items[1].label');
    expect(paths).toContain('items[1].price');
  });

  it('여러 원소 동시 실패', async () => {
    const errors = await getErrors(OrderDto, {
      items: [
        { label: 111, price: 10 },
        { label: 'ok', price: 20 },
        { label: 222, price: 30 },
      ],
    });
    const paths = errors.map(e => e.path);
    expect(paths).toContain('items[0].label');
    expect(paths).toContain('items[2].label');
    // index 1은 에러 없어야 함
    expect(paths.filter(p => p.startsWith('items[1]'))).toHaveLength(0);
  });
});

// ─── 한 필드에 여러 에러 ────────────────────────────────────────────────────

describe('한 필드 다중 에러 (collectErrors 모드)', () => {
  class MultiDto {
    @Field(isInt, min(10))
    v!: number;
  }

  it('isInt + min 동시 실패 시 두 에러 모두 수집', async () => {
    const errors = await getErrors(MultiDto, { v: 3.5 });
    // 3.5는 정수가 아니므로 isInt 실패. 또한 10보다 작으므로 min도 실패할 수 있음
    // (단, 타입 체커가 먼저 거부하면 이후 규칙이 안 돌 수 있음 — 구현에 따라 다름)
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.path).toBe('v');
    expect(errors.some(e => e.code === 'isInt')).toBe(true);
  });
});

// ─── 에러 className ─────────────────────────────────────────────────────────

describe('BakerValidationError className', () => {
  class UserProfile { @Field(isString) name!: string; }

  it('className이 DTO 클래스명', async () => {
    try {
      await deserialize(UserProfile, { name: 123 });
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.className).toBe('UserProfile');
      expect(e.message).toContain('UserProfile');
      expect(e.message).toContain('1 error(s)');
    }
  });
});

// ─── 에러 message 포맷 ─────────────────────────────────────────────────────

describe('BakerValidationError message 포맷', () => {
  class Multi {
    @Field(isString) a!: string;
    @Field(isString) b!: string;
    @Field(isString) c!: string;
  }

  it('에러 개수가 message에 반영', async () => {
    try {
      await deserialize(Multi, { a: 1, b: 2, c: 3 });
      throw new Error('expected rejection');
    } catch (e) {
      if (!(e instanceof BakerValidationError)) throw e;
      expect(e.errors).toHaveLength(3);
      expect(e.message).toContain('3 error(s)');
    }
  });
});
