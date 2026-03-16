import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deserialize, Field, toJsonSchema } from '../../index';
import { isString, isNumber, min, max } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => unseal());
afterEach(() => unseal());
// ─────────────────────────────────────────────────────────────────────────────

class NullableStringDto {
  @Field(isString, { nullable: true })
  nickname!: string | null;

  @Field(isString)
  name!: string;
}

class NullableOptionalDto {
  @Field(isString, { nullable: true, optional: true })
  bio!: string | null | undefined;
}

class NullableNumberDto {
  @Field(isNumber(), min(0), max(200), { nullable: true })
  age!: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('nullable 역직렬화', () => {
  it('null 값 허용', async () => {
    const result = await deserialize<NullableStringDto>(NullableStringDto, {
      nickname: null, name: 'Alice',
    });
    expect(result.nickname).toBeNull();
    expect(result.name).toBe('Alice');
  });

  it('유효 값 통과', async () => {
    const result = await deserialize<NullableStringDto>(NullableStringDto, {
      nickname: 'bob', name: 'Alice',
    });
    expect(result.nickname).toBe('bob');
  });

  it('undefined → 거부 (nullable without optional)', async () => {
    await expect(
      deserialize(NullableStringDto, { name: 'Alice' }),
    ).rejects.toThrow();
  });

  it('nullable + optional → null과 undefined 모두 허용', async () => {
    const r1 = await deserialize<NullableOptionalDto>(NullableOptionalDto, { bio: null });
    expect(r1.bio).toBeNull();

    const r2 = await deserialize<NullableOptionalDto>(NullableOptionalDto, {});
    expect(r2.bio).toBeUndefined();
  });

  it('nullable number null → 할당, 유효 값 → 검증 통과', async () => {
    const r1 = await deserialize<NullableNumberDto>(NullableNumberDto, { age: null });
    expect(r1.age).toBeNull();

    const r2 = await deserialize<NullableNumberDto>(NullableNumberDto, { age: 25 });
    expect(r2.age).toBe(25);
  });

  it('nullable number 범위 위반 → 에러', async () => {
    await expect(deserialize(NullableNumberDto, { age: -1 })).rejects.toThrow();
  });
});

describe('nullable toJsonSchema', () => {
  it('type 배열에 "null" 추가', () => {
    const schema = toJsonSchema(NullableStringDto);
    expect(schema.properties!.nickname).toEqual({ type: ['string', 'null'] });
    expect(schema.properties!.name).toEqual({ type: 'string' });
  });

  it('nullable number → ["number", "null"] with constraints', () => {
    const schema = toJsonSchema(NullableNumberDto);
    expect(schema.properties!.age).toEqual({
      type: ['number', 'null'], minimum: 0, maximum: 200,
    });
  });
});

// ─── E-17: nullable nested DTO JSON Schema → oneOf: [$ref, {type:'null'}] ──

describe('E-17: nullable nested DTO toJsonSchema', () => {
  class AddressDto {
    @Field(isString)
    street!: string;

    @Field(isString)
    city!: string;
  }

  class PersonWithNullableAddressDto {
    @Field(isString)
    name!: string;

    @Field({ type: () => AddressDto, nullable: true })
    address!: AddressDto | null;
  }

  it('nullable nested DTO → oneOf: [$ref, {type:"null"}]', () => {
    const schema = toJsonSchema(PersonWithNullableAddressDto);
    const addrSchema = schema.properties!.address;
    expect(addrSchema).toBeDefined();
    expect(addrSchema!.oneOf).toBeDefined();
    expect(addrSchema!.oneOf).toHaveLength(2);
    // First element should be $ref to AddressDto
    expect(addrSchema!.oneOf![0]!.$ref).toContain('AddressDto');
    // Second element should be {type:'null'}
    expect(addrSchema!.oneOf![1]).toEqual({ type: 'null' });
  });

  it('non-nullable nested DTO → plain $ref (no oneOf)', () => {
    class PersonDto {
      @Field(isString)
      name!: string;

      @Field({ type: () => AddressDto })
      address!: AddressDto;
    }

    const schema = toJsonSchema(PersonDto);
    const addrSchema = schema.properties!.address;
    expect(addrSchema!.$ref).toContain('AddressDto');
    expect(addrSchema!.oneOf).toBeUndefined();
  });
});
