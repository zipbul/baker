import { describe, it, expect, afterEach } from 'bun:test';
import {
  seal, deserialize, serialize,
  IsString, IsNumber, IsBoolean, IsOptional, IsNullable,
  Nested, Expose, Exclude, Transform, Min, MinLength, IsEmail,
  ArrayMinSize,
} from '../../index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─── 1. 단순 플랫 DTO 라운드트립 ───────────────────────────────────────────

describe('플랫 DTO 라운드트립', () => {
  class FlatDto {
    @IsString() name!: string;
    @IsNumber() age!: number;
    @IsBoolean() active!: boolean;
  }

  it('deserialize → serialize → deserialize 동일', async () => {
    const input = { name: 'Alice', age: 30, active: true };
    seal();
    const obj1 = await deserialize<FlatDto>(FlatDto, input);
    const plain = await serialize(obj1);
    const obj2 = await deserialize<FlatDto>(FlatDto, plain);
    expect(obj2.name).toBe(input.name);
    expect(obj2.age).toBe(input.age);
    expect(obj2.active).toBe(input.active);
  });
});

// ─── 2. 중첩 DTO 라운드트립 ────────────────────────────────────────────────

describe('중첩 DTO 라운드트립', () => {
  class Address {
    @IsString() city!: string;
    @IsString() zip!: string;
  }

  class PersonDto {
    @IsString() name!: string;
    @Nested(() => Address) address!: Address;
  }

  it('deserialize → serialize → deserialize 동일', async () => {
    const input = { name: 'Bob', address: { city: 'Seoul', zip: '06000' } };
    seal();
    const obj1 = await deserialize<PersonDto>(PersonDto, input);
    const plain = await serialize(obj1);
    const obj2 = await deserialize<PersonDto>(PersonDto, plain);
    expect(obj2.name).toBe(input.name);
    expect(obj2.address.city).toBe(input.address.city);
    expect(obj2.address.zip).toBe(input.address.zip);
  });
});

// ─── 3. @Expose name 매핑 라운드트립 ───────────────────────────────────────

describe('@Expose name 매핑 라운드트립', () => {
  class MappedDto {
    @Expose({ name: 'user_name' })
    @IsString()
    userName!: string;

    @Expose({ name: 'user_age' })
    @IsNumber()
    userAge!: number;
  }

  it('snake_case 입력 → 직렬화 → 재역직렬화', async () => {
    const input = { user_name: 'Carol', user_age: 25 };
    seal();
    const obj1 = await deserialize<MappedDto>(MappedDto, input);
    expect(obj1.userName).toBe('Carol');
    const plain = await serialize(obj1);
    expect(plain).toHaveProperty('user_name', 'Carol');
    expect(plain).toHaveProperty('user_age', 25);
    const obj2 = await deserialize<MappedDto>(MappedDto, plain);
    expect(obj2.userName).toBe('Carol');
    expect(obj2.userAge).toBe(25);
  });
});

// ─── 4. @Transform 포함 라운드트립 ─────────────────────────────────────────

describe('@Transform 포함 라운드트립', () => {
  class TrimDto {
    @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
    @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value, { serializeOnly: true })
    @IsString()
    tag!: string;
  }

  it('deserialize trim → serialize uppercase → deserialize trim', async () => {
    seal();
    const obj1 = await deserialize<TrimDto>(TrimDto, { tag: '  hello  ' });
    expect(obj1.tag).toBe('hello'); // trimmed

    const plain = await serialize(obj1);
    expect(plain.tag).toBe('HELLO'); // uppercased on serialize

    const obj2 = await deserialize<TrimDto>(TrimDto, plain);
    expect(obj2.tag).toBe('HELLO'); // trimmed (already trimmed)
  });
});

// ─── 5. @IsOptional + @IsNullable 라운드트립 ──────────────────────────────

describe('@IsOptional + @IsNullable 라운드트립', () => {
  class NullableDto {
    @IsString() name!: string;
    @IsOptional() @IsNullable() @IsString() nickname?: string | null;
  }

  it('nickname 존재 시 라운드트립', async () => {
    const input = { name: 'Dave', nickname: 'D' };
    seal();
    const obj = await deserialize<NullableDto>(NullableDto, input);
    const plain = await serialize(obj);
    const obj2 = await deserialize<NullableDto>(NullableDto, plain);
    expect(obj2.nickname).toBe('D');
  });

  it('nickname = null 라운드트립', async () => {
    const input = { name: 'Dave', nickname: null };
    seal();
    const obj = await deserialize<NullableDto>(NullableDto, input);
    expect(obj.nickname).toBeNull();
    const plain = await serialize(obj);
    const obj2 = await deserialize<NullableDto>(NullableDto, plain);
    expect(obj2.nickname).toBeNull();
  });

  it('nickname 누락 라운드트립', async () => {
    const input = { name: 'Dave' };
    seal();
    const obj = await deserialize<NullableDto>(NullableDto, input);
    expect(obj.nickname).toBeUndefined();
    const plain = await serialize(obj);
    const obj2 = await deserialize<NullableDto>(NullableDto, plain);
    expect(obj2.nickname).toBeUndefined();
  });
});

// ─── 6. Nested 배열 라운드트립 ─────────────────────────────────────────────

describe('Nested 배열 라운드트립', () => {
  class LineItem {
    @IsString() product!: string;
    @IsNumber() @Min(1) qty!: number;
  }

  class OrderDto {
    @IsString() orderId!: string;
    @Nested(() => LineItem, { each: true })
    @ArrayMinSize(1)
    items!: LineItem[];
  }

  it('배열 항목 전체 라운드트립', async () => {
    const input = {
      orderId: 'ORD-001',
      items: [
        { product: 'Laptop', qty: 2 },
        { product: 'Mouse', qty: 5 },
      ],
    };
    seal();
    const obj = await deserialize<OrderDto>(OrderDto, input);
    const plain = await serialize(obj);
    const obj2 = await deserialize<OrderDto>(OrderDto, plain);
    expect(obj2.orderId).toBe('ORD-001');
    expect(obj2.items).toHaveLength(2);
    expect(obj2.items[0].product).toBe('Laptop');
    expect(obj2.items[0].qty).toBe(2);
    expect(obj2.items[1].product).toBe('Mouse');
    expect(obj2.items[1].qty).toBe(5);
  });
});

// ─── 7. @Exclude 필드 라운드트립 ───────────────────────────────────────────

describe('@Exclude 필드 라운드트립', () => {
  class SecretDto {
    @IsString() username!: string;
    @Exclude() @IsString() password!: string;
  }

  it('Exclude 필드는 양방향 제외', async () => {
    seal();
    const obj = await deserialize<SecretDto>(SecretDto, { username: 'admin', password: 'secret' });
    // @Exclude() 기본은 양방향 → deserialize에서도 제외
    expect(obj.password).toBeUndefined();
    const plain = await serialize(obj);
    expect(plain).not.toHaveProperty('password');
  });
});

// ─── 8. 복합 DTO 전체 라운드트립 ───────────────────────────────────────────

describe('복합 DTO 전체 라운드트립', () => {
  class ContactInfo {
    @IsEmail() email!: string;
    @IsOptional() @IsString() phone?: string;
  }

  class ProfileDto {
    @Expose({ name: 'full_name' })
    @IsString()
    @MinLength(2)
    fullName!: string;

    @IsNumber()
    @Min(0)
    age!: number;

    @Nested(() => ContactInfo)
    contact!: ContactInfo;

    @IsOptional()
    @IsNullable()
    @IsString()
    bio?: string | null;
  }

  it('완전한 라운드트립 데이터 무결성', async () => {
    const input = {
      full_name: 'Test User',
      age: 28,
      contact: { email: 'test@example.com', phone: '+821012345678' },
      bio: 'Hello World',
    };
    seal();
    const obj = await deserialize<ProfileDto>(ProfileDto, input);
    const plain = await serialize(obj);
    const obj2 = await deserialize<ProfileDto>(ProfileDto, plain);

    expect(obj2.fullName).toBe('Test User');
    expect(obj2.age).toBe(28);
    expect(obj2.contact.email).toBe('test@example.com');
    expect(obj2.contact.phone).toBe('+821012345678');
    expect(obj2.bio).toBe('Hello World');
  });

  it('nullable bio=null 라운드트립', async () => {
    const input = {
      full_name: 'Test User',
      age: 28,
      contact: { email: 'test@example.com' },
      bio: null,
    };
    seal();
    const obj = await deserialize<ProfileDto>(ProfileDto, input);
    const plain = await serialize(obj);
    const obj2 = await deserialize<ProfileDto>(ProfileDto, plain);
    expect(obj2.bio).toBeNull();
  });
});
