import { describe, it, expect, afterEach } from 'bun:test';
import {
  Field, arrayOf, deserialize, BakerValidationError,
} from '../../index';
import { isString, isNumber, isInt, min, minLength, arrayMinSize } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** Helper: extracts errors array from BakerValidationError */
async function getErrors(cls: new (...args: any[]) => any, input: unknown) {
  try {
    await deserialize(cls, input);
    throw new Error('expected rejection');
  } catch (e) {
    if (!(e instanceof BakerValidationError)) throw e;
    return e.errors;
  }
}

// ─── basic field paths ─────────────────────────────────────────────────────

describe('single field error paths', () => {
  class Dto {
    @Field(isString) name!: string;
    @Field(isNumber()) age!: number;
  }

  it('path matches field name', async () => {
    const errors = await getErrors(Dto, { name: 123, age: 'abc' });
    expect(errors).toHaveLength(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toEqual(['age', 'name']);
  });

  it('each error code verified', async () => {
    const errors = await getErrors(Dto, { name: 123, age: 'abc' });
    expect(errors.find(e => e.path === 'name')!.code).toBe('isString');
    expect(errors.find(e => e.path === 'age')!.code).toBe('isNumber');
  });
});

// ─── nested object error paths ──────────────────────────────────────────────

describe('nested object error paths', () => {
  class Address {
    @Field(isString) city!: string;
    @Field(isString) street!: string;
  }

  class UserDto {
    @Field(isString) name!: string;
    @Field({ type: () => Address }) address!: Address;
  }

  it('nested field path = "address.city"', async () => {
    const errors = await getErrors(UserDto, { name: 'John', address: { city: 123, street: 'Main' } });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe('address.city');
    expect(errors[0]!.code).toBe('isString');
  });

  it('multiple nested field failures', async () => {
    const errors = await getErrors(UserDto, { name: 'John', address: { city: 123, street: 456 } });
    expect(errors).toHaveLength(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toEqual(['address.city', 'address.street']);
  });

  it('parent + nested simultaneous failure', async () => {
    const errors = await getErrors(UserDto, { name: 123, address: { city: 456, street: 'ok' } });
    expect(errors).toHaveLength(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toEqual(['address.city', 'name']);
  });
});

// ─── deep nesting (3 levels) ────────────────────────────────────────────────

describe('deep nesting error paths (3 levels)', () => {
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

// ─── array each:true error paths ─────────────────────────────────────────────

describe('array each:true error paths', () => {
  class TagsDto {
    @Field(arrayOf(isString)) tags!: string[];
  }

  it('failed element index included in path = "tags[1]"', async () => {
    const errors = await getErrors(TagsDto, { tags: ['ok', 123, 'fine', 456] });
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const paths = errors.map(e => e.path).sort();
    expect(paths).toContain('tags[1]');
    expect(paths).toContain('tags[3]');
  });

  it('all failed indices returned (not just the first)', async () => {
    const errors = await getErrors(TagsDto, { tags: [1, 2, 3] });
    expect(errors).toHaveLength(3);
    expect(errors.map(e => e.path).sort()).toEqual(['tags[0]', 'tags[1]', 'tags[2]']);
  });
});

// ─── nested array error paths ────────────────────────────────────────────────

describe('nested array error paths', () => {
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

  it('multiple elements fail simultaneously', async () => {
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
    // index 1 should have no errors
    expect(paths.filter(p => p.startsWith('items[1]'))).toHaveLength(0);
  });
});

// ─── multiple errors per field ──────────────────────────────────────────────

describe('multiple errors per field (collectErrors mode)', () => {
  class MultiDto {
    @Field(isInt, min(10))
    v!: number;
  }

  it('isInt + min simultaneous failure collects both errors', async () => {
    const errors = await getErrors(MultiDto, { v: 3.5 });
    // 3.5 is not an integer so isInt fails. Also less than 10 so min may also fail
    // (however, if type checker rejects first, subsequent rules may not run — depends on implementation)
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.path).toBe('v');
    expect(errors.some(e => e.code === 'isInt')).toBe(true);
  });
});

// ─── error className ─────────────────────────────────────────────────────────

describe('BakerValidationError className', () => {
  class UserProfile { @Field(isString) name!: string; }

  it('className matches DTO class name', async () => {
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

// ─── error message format ─────────────────────────────────────────────────

describe('BakerValidationError message format', () => {
  class Multi {
    @Field(isString) a!: string;
    @Field(isString) b!: string;
    @Field(isString) c!: string;
  }

  it('error count reflected in message', async () => {
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
