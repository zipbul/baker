import { describe, it, expect } from 'bun:test';
import {
  deserialize, serialize,
  Field,
} from '../../index';
import {
  isString, isNumber, isBoolean, isEmail,
  min, minLength, arrayMinSize,
} from '../../src/rules/index';
// ─── 1. simple flat DTO roundtrip ────────────────────────────────────────────

describe('flat DTO roundtrip', () => {
  class FlatDto {
    @Field(isString) name!: string;
    @Field(isNumber()) age!: number;
    @Field(isBoolean) active!: boolean;
  }

  it('deserialize → serialize → deserialize identical', async () => {
    const input = { name: 'Alice', age: 30, active: true };
    const obj1 = await deserialize<FlatDto>(FlatDto, input);
    const plain = await serialize(obj1);
    const obj2 = await deserialize<FlatDto>(FlatDto, plain);
    expect(obj2.name).toBe(input.name);
    expect(obj2.age).toBe(input.age);
    expect(obj2.active).toBe(input.active);
  });
});

// ─── 2. nested DTO roundtrip ────────────────────────────────────────────────

describe('nested DTO roundtrip', () => {
  class Address {
    @Field(isString) city!: string;
    @Field(isString) zip!: string;
  }

  class PersonDto {
    @Field(isString) name!: string;
    @Field({ type: () => Address }) address!: Address;
  }

  it('deserialize → serialize → deserialize identical', async () => {
    const input = { name: 'Bob', address: { city: 'Seoul', zip: '06000' } };
    const obj1 = await deserialize<PersonDto>(PersonDto, input);
    const plain = await serialize(obj1);
    const obj2 = await deserialize<PersonDto>(PersonDto, plain);
    expect(obj2.name).toBe(input.name);
    expect(obj2.address.city).toBe(input.address.city);
    expect(obj2.address.zip).toBe(input.address.zip);
  });
});

// ─── 3. @Field({ name }) mapping roundtrip ──────────────────────────────────

describe('@Field({ name }) mapping roundtrip', () => {
  class MappedDto {
    @Field(isString, { name: 'user_name' })
    userName!: string;

    @Field(isNumber(), { name: 'user_age' })
    userAge!: number;
  }

  it('snake_case input → serialize → re-deserialize', async () => {
    const input = { user_name: 'Carol', user_age: 25 };
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

// ─── 4. @Transform roundtrip ────────────────────────────────────────────────

describe('@Transform roundtrip', () => {
  class TrimDto {
    @Field(isString, {
      transform: ({ value, direction }) => {
        let v = typeof value === 'string' ? value.trim() : value;
        if (direction === 'serialize') {
          v = typeof v === 'string' ? v.toUpperCase() : v;
        }
        return v;
      },
    })
    tag!: string;
  }

  it('deserialize trim → serialize uppercase → deserialize trim', async () => {
    const obj1 = await deserialize<TrimDto>(TrimDto, { tag: '  hello  ' });
    expect(obj1.tag).toBe('hello'); // trimmed

    const plain = await serialize(obj1);
    expect(plain.tag).toBe('HELLO'); // uppercased on serialize

    const obj2 = await deserialize<TrimDto>(TrimDto, plain);
    expect(obj2.tag).toBe('HELLO'); // trimmed (already trimmed)
  });
});

// ─── 5. optional + nullable roundtrip ────────────────────────────────────

describe('optional + nullable roundtrip', () => {
  class NullableDto {
    @Field(isString) name!: string;
    @Field(isString, { optional: true, nullable: true }) nickname?: string | null;
  }

  it('nickname present roundtrip', async () => {
    const input = { name: 'Dave', nickname: 'D' };
    const obj = await deserialize<NullableDto>(NullableDto, input);
    const plain = await serialize(obj);
    const obj2 = await deserialize<NullableDto>(NullableDto, plain);
    expect(obj2.nickname).toBe('D');
  });

  it('nickname = null roundtrip', async () => {
    const input = { name: 'Dave', nickname: null };
    const obj = await deserialize<NullableDto>(NullableDto, input);
    expect(obj.nickname).toBeNull();
    const plain = await serialize(obj);
    const obj2 = await deserialize<NullableDto>(NullableDto, plain);
    expect(obj2.nickname).toBeNull();
  });

  it('nickname missing roundtrip', async () => {
    const input = { name: 'Dave' };
    const obj = await deserialize<NullableDto>(NullableDto, input);
    expect(obj.nickname).toBeUndefined();
    const plain = await serialize(obj);
    const obj2 = await deserialize<NullableDto>(NullableDto, plain);
    expect(obj2.nickname).toBeUndefined();
  });
});

// ─── 6. nested array roundtrip ──────────────────────────────────────────────

describe('nested array roundtrip', () => {
  class LineItem {
    @Field(isString) product!: string;
    @Field(isNumber(), min(1)) qty!: number;
  }

  class OrderDto {
    @Field(isString) orderId!: string;
    @Field(arrayMinSize(1), { type: () => [LineItem] })
    items!: LineItem[];
  }

  it('all array items roundtrip', async () => {
    const input = {
      orderId: 'ORD-001',
      items: [
        { product: 'Laptop', qty: 2 },
        { product: 'Mouse', qty: 5 },
      ],
    };
    const obj = await deserialize<OrderDto>(OrderDto, input);
    const plain = await serialize(obj);
    const obj2 = await deserialize<OrderDto>(OrderDto, plain);
    expect(obj2.orderId).toBe('ORD-001');
    expect(obj2.items).toHaveLength(2);
    expect(obj2.items[0]!.product).toBe('Laptop');
    expect(obj2.items[0]!.qty).toBe(2);
    expect(obj2.items[1]!.product).toBe('Mouse');
    expect(obj2.items[1]!.qty).toBe(5);
  });
});

// ─── 7. @Exclude field roundtrip ────────────────────────────────────────────

describe('@Exclude field roundtrip', () => {
  class SecretDto {
    @Field(isString) username!: string;
    @Field(isString, { exclude: true }) password!: string;
  }

  it('Exclude field excluded in both directions', async () => {
    const obj = await deserialize<SecretDto>(SecretDto, { username: 'admin', password: 'secret' });
    // @Exclude() default is both directions → excluded from deserialize too
    expect(obj.password).toBeUndefined();
    const plain = await serialize(obj);
    expect(plain).not.toHaveProperty('password');
  });
});

// ─── 8. complex DTO full roundtrip ──────────────────────────────────────────

describe('complex DTO full roundtrip', () => {
  class ContactInfo {
    @Field(isEmail()) email!: string;
    @Field(isString, { optional: true }) phone?: string;
  }

  class ProfileDto {
    @Field(isString, minLength(2), { name: 'full_name' })
    fullName!: string;

    @Field(isNumber(), min(0))
    age!: number;

    @Field({ type: () => ContactInfo })
    contact!: ContactInfo;

    @Field(isString, { optional: true, nullable: true })
    bio?: string | null;
  }

  it('complete roundtrip data integrity', async () => {
    const input = {
      full_name: 'Test User',
      age: 28,
      contact: { email: 'test@example.com', phone: '+821012345678' },
      bio: 'Hello World',
    };
    const obj = await deserialize<ProfileDto>(ProfileDto, input);
    const plain = await serialize(obj);
    const obj2 = await deserialize<ProfileDto>(ProfileDto, plain);

    expect(obj2.fullName).toBe('Test User');
    expect(obj2.age).toBe(28);
    expect(obj2.contact.email).toBe('test@example.com');
    expect(obj2.contact.phone).toBe('+821012345678');
    expect(obj2.bio).toBe('Hello World');
  });

  it('nullable bio=null roundtrip', async () => {
    const input = {
      full_name: 'Test User',
      age: 28,
      contact: { email: 'test@example.com' },
      bio: null,
    };
    const obj = await deserialize<ProfileDto>(ProfileDto, input);
    const plain = await serialize(obj);
    const obj2 = await deserialize<ProfileDto>(ProfileDto, plain);
    expect(obj2.bio).toBeNull();
  });
});
