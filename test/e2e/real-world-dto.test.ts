import { describe, it, expect } from 'bun:test';
import {
  deserialize, serialize, toJsonSchema, BakerValidationError,
  Field, Exclude,
} from '../../index';
import {
  isString, isNumber, isBoolean, isEmail, isEnum,
  min, max, minLength, maxLength, arrayMinSize,
} from '../../src/rules/index';
import { Expose, Transform } from '../../src/decorators/transform';

// ─────────────────────────────────────────────────────────────────────────────

enum Role { Admin = 'admin', User = 'user', Guest = 'guest' }

class AddressDto {
  @Field(isString, minLength(1))
  city!: string;

  @Field(isString, minLength(1))
  street!: string;

  @Field(isString, { optional: true })
  zipCode?: string;
}

class CreateUserDto {
  @Field(isString, minLength(2), maxLength(50))
  @Expose({ name: 'user_name', deserializeOnly: true })
  @Expose({ name: 'userName', serializeOnly: true })
  name!: string;

  @Field(isEmail())
  email!: string;

  @Field(isNumber(), min(0), max(150))
  age!: number;

  @Field(isEnum(Role))
  role!: Role;

  @Field(isBoolean, { optional: true })
  active?: boolean;

  @Field(isString, { nullable: true })
  bio!: string | null;

  @Field({ type: () => AddressDto })
  address!: AddressDto;

  @Field(arrayMinSize(1), { type: () => [AddressDto], optional: true })
  addresses?: AddressDto[];

  @Exclude({ serializeOnly: true })
  @Field(isString)
  password!: string;

  @Field(isString, { transform: ({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value })
  tag!: string;
}

// ─────────────────────────────────────────────────────────────────────────────

const validInput = {
  user_name: 'Alice Kim',
  email: 'alice@example.com',
  age: 28,
  role: 'admin',
  active: true,
  bio: null,
  address: { city: 'Seoul', street: '강남대로 123' },
  password: 'secret123',
  tag: '  Frontend Dev  ',
};

describe('CreateUserDto — 역직렬화', () => {
  it('유효한 입력 → 전체 필드 통과', async () => {
    const user = await deserialize<CreateUserDto>(CreateUserDto, validInput);
    expect(user).toBeInstanceOf(CreateUserDto);
    expect(user.name).toBe('Alice Kim');
    expect(user.email).toBe('alice@example.com');
    expect(user.age).toBe(28);
    expect(user.role).toBe(Role.Admin);
    expect(user.active).toBe(true);
    expect(user.bio).toBeNull();
    expect(user.address).toBeInstanceOf(AddressDto);
    expect(user.address.city).toBe('Seoul');
    expect(user.password).toBe('secret123');
    expect(user.tag).toBe('frontend dev'); // trim + toLowerCase
  });

  it('optional 필드 없이 통과', async () => {
    const input = { ...validInput };
    delete (input as any).active;
    delete (input as any).addresses;
    const user = await deserialize<CreateUserDto>(CreateUserDto, input);
    expect(user.active).toBeUndefined();
  });

  it('nullable → null 허용', async () => {
    const user = await deserialize<CreateUserDto>(CreateUserDto, validInput);
    expect(user.bio).toBeNull();
  });
});

describe('CreateUserDto — 검증 실패', () => {
  it('이름 너무 짧음', async () => {
    await expect(
      deserialize(CreateUserDto, { ...validInput, user_name: 'A' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('잘못된 이메일', async () => {
    await expect(
      deserialize(CreateUserDto, { ...validInput, email: 'not-email' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('나이 범위 초과', async () => {
    await expect(
      deserialize(CreateUserDto, { ...validInput, age: 200 }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('잘못된 enum 값', async () => {
    await expect(
      deserialize(CreateUserDto, { ...validInput, role: 'superadmin' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('중첩 DTO 검증 실패', async () => {
    await expect(
      deserialize(CreateUserDto, { ...validInput, address: { city: '', street: 'ok' } }),
    ).rejects.toThrow(BakerValidationError);
  });
});

describe('CreateUserDto — 직렬화', () => {
  it('serialize → @Expose 방향별 키, @Exclude serializeOnly', async () => {
    const dto = await deserialize<CreateUserDto>(CreateUserDto, validInput);
    const plain = await serialize(dto);
    // serializeOnly @Expose → userName
    expect(plain['userName']).toBe('Alice Kim');
    expect(plain['user_name']).toBeUndefined();
    expect(plain['name']).toBeUndefined();
    // @Exclude serializeOnly → password 제외
    expect(plain['password']).toBeUndefined();
    // 나머지 필드
    expect(plain['email']).toBe('alice@example.com');
    expect(plain['age']).toBe(28);
    expect(plain['role']).toBe('admin');
  });
});

describe('CreateUserDto — toJsonSchema', () => {
  it('스키마 필드 타입 매핑', () => {
    const schema = toJsonSchema(CreateUserDto, { direction: 'deserialize' });
    expect(schema.type).toBe('object');
    expect(schema.properties!.user_name).toBeDefined();
    expect(schema.properties!.user_name!.type).toBe('string');
    expect(schema.properties!.user_name!.minLength).toBe(2);
    expect(schema.properties!.email!.format).toBe('email');
    expect(schema.properties!.age!.minimum).toBe(0);
    expect(schema.properties!.age!.maximum).toBe(150);
    expect(schema.properties!.role).toEqual({ enum: ['admin', 'user', 'guest'] });
    expect(schema.properties!.bio!.type).toEqual(['string', 'null']);
  });

  it('중첩 → $ref + $defs', () => {
    const schema = toJsonSchema(CreateUserDto);
    expect(schema.properties!.address!.$ref).toBe('#/$defs/AddressDto');
    expect(schema.$defs!.AddressDto).toBeDefined();
  });
});
