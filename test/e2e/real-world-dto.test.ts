import { describe, it, expect } from 'bun:test';
import {
  deserialize, serialize, isBakerError,
  Field,
} from '../../index';
import {
  isString, isNumber, isBoolean, isEmail, isEnum,
  min, max, minLength, maxLength, arrayMinSize,
} from '../../src/rules/index';
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
  @Field(isString, minLength(2), maxLength(50), { deserializeName: 'user_name', serializeName: 'userName' })
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

  @Field(isString, { exclude: 'serializeOnly' })
  password!: string;

  @Field(isString, { transform: { deserialize: ({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value, serialize: ({ value }) => value } })
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

describe('CreateUserDto — deserialization', () => {
  it('valid input → all fields pass', async () => {
    const user = await deserialize(CreateUserDto, validInput) as CreateUserDto;
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

  it('passes without optional fields', async () => {
    const input = { ...validInput };
    delete (input as any).active;
    delete (input as any).addresses;
    const user = await deserialize(CreateUserDto, input) as CreateUserDto;
    expect(user.active).toBeUndefined();
  });

  it('nullable → null allowed', async () => {
    const user = await deserialize(CreateUserDto, validInput) as CreateUserDto;
    expect(user.bio).toBeNull();
  });
});

describe('CreateUserDto — validation failure', () => {
  it('name too short', async () => {
    expect(isBakerError(await deserialize(CreateUserDto, { ...validInput, user_name: 'A' }))).toBe(true);
  });

  it('invalid email', async () => {
    expect(isBakerError(await deserialize(CreateUserDto, { ...validInput, email: 'not-email' }))).toBe(true);
  });

  it('age out of range', async () => {
    expect(isBakerError(await deserialize(CreateUserDto, { ...validInput, age: 200 }))).toBe(true);
  });

  it('invalid enum value', async () => {
    expect(isBakerError(await deserialize(CreateUserDto, { ...validInput, role: 'superadmin' }))).toBe(true);
  });

  it('nested DTO validation failure', async () => {
    expect(isBakerError(await deserialize(CreateUserDto, { ...validInput, address: { city: '', street: 'ok' } }))).toBe(true);
  });
});

describe('CreateUserDto — serialization', () => {
  it('serialize → direction-specific keys, @Exclude serializeOnly', async () => {
    const dto = await deserialize(CreateUserDto, validInput) as CreateUserDto;
    const plain = await serialize(dto);
    // serializeOnly @Expose → userName
    expect(plain['userName']).toBe('Alice Kim');
    expect(plain['user_name']).toBeUndefined();
    expect(plain['name']).toBeUndefined();
    // @Exclude serializeOnly → password excluded
    expect(plain['password']).toBeUndefined();
    // remaining fields
    expect(plain['email']).toBe('alice@example.com');
    expect(plain['age']).toBe(28);
    expect(plain['role']).toBe('admin');
  });
});

