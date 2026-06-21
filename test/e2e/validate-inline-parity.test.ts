import { describe, it, expect } from 'bun:test';

import { Field, Baker, isBakerIssueSet } from '../../index';
import { isString, isNumber, isBoolean, min, max, minLength, arrayMinSize } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

/**
 * Parity test: validate() must return the same errors as deserialize()
 * for every nesting scenario. This proves the inline code generation
 * produces identical validation results.
 */

function expectSameErrors(desResult: unknown, valResult: unknown, _label: string) {
  const desIsErr = isBakerIssueSet(desResult);
  const valIsErr = isBakerIssueSet(valResult);
  expect(valIsErr).toBe(desIsErr);

  if (isBakerIssueSet(desResult) && isBakerIssueSet(valResult)) {
    const desErrors = desResult.errors.map(e => ({ path: e.path, code: e.code }));
    const valErrors = valResult.errors.map(e => ({ path: e.path, code: e.code }));
    desErrors.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
    valErrors.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
    expect(valErrors).toEqual(desErrors);
  } else if (!desIsErr && !valIsErr) {
    // deserialize returns object, validate returns true
    expect(valResult).toBe(true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Flat DTO — baseline
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — flat DTO', () => {
  const baker = new Baker();
  @baker.Recipe
  class Flat {
    @Field(isString, minLength(1)) name!: string;
    @Field(isNumber(), min(0)) age!: number;
    @Field(isBoolean) active!: boolean;
  }

  baker.seal();

  it('valid', () => {
    const input = { name: 'Alice', age: 30, active: true };
    expectSameErrors(baker.deserialize(Flat, input), baker.validate(Flat, input), 'flat valid');
  });

  it('all invalid', () => {
    const input = {};
    expectSameErrors(baker.deserialize(Flat, input), baker.validate(Flat, input), 'flat all invalid');
  });

  it('partial invalid', () => {
    const input = { name: '', age: -1, active: 'not bool' };
    expectSameErrors(baker.deserialize(Flat, input), baker.validate(Flat, input), 'flat partial');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Single level nested
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — single nested', () => {
  const baker = new Baker();
  @baker.Recipe
  class Address {
    @Field(isString) street!: string;
    @Field(isString) city!: string;
  }
  @baker.Recipe
  class Person {
    @Field(isString) name!: string;
    @Field({ type: () => Address }) address!: Address;
  }

  baker.seal();

  it('valid', () => {
    const input = { name: 'Bob', address: { street: '123 Main', city: 'NYC' } };
    expectSameErrors(baker.deserialize(Person, input), baker.validate(Person, input), 'nested valid');
  });

  it('nested field invalid', () => {
    const input = { name: 'Bob', address: { street: 123, city: null } };
    expectSameErrors(baker.deserialize(Person, input), baker.validate(Person, input), 'nested invalid');
  });

  it('nested object missing', () => {
    const input = { name: 'Bob' };
    expectSameErrors(baker.deserialize(Person, input), baker.validate(Person, input), 'nested missing');
  });

  it('nested object is null', () => {
    const input = { name: 'Bob', address: null };
    expectSameErrors(baker.deserialize(Person, input), baker.validate(Person, input), 'nested null');
  });

  it('nested object is non-object', () => {
    const input = { name: 'Bob', address: 'not an object' };
    expectSameErrors(baker.deserialize(Person, input), baker.validate(Person, input), 'nested non-obj');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Array of nested DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — array of nested', () => {
  const baker = new Baker();
  @baker.Recipe
  class Item {
    @Field(isString, minLength(1)) name!: string;
    @Field(isNumber(), min(0)) price!: number;
  }
  @baker.Recipe
  class Cart {
    @Field(arrayMinSize(1), { type: () => [Item] }) items!: Item[];
  }

  baker.seal();

  it('valid', () => {
    const input = {
      items: [
        { name: 'A', price: 10 },
        { name: 'B', price: 20 },
      ],
    };
    expectSameErrors(baker.deserialize(Cart, input), baker.validate(Cart, input), 'array valid');
  });

  it('empty array', () => {
    const input = { items: [] };
    expectSameErrors(baker.deserialize(Cart, input), baker.validate(Cart, input), 'array empty');
  });

  it('invalid items', () => {
    const input = {
      items: [
        { name: '', price: -1 },
        { name: 'ok', price: 'bad' },
      ],
    };
    expectSameErrors(baker.deserialize(Cart, input), baker.validate(Cart, input), 'array invalid items');
  });

  it('non-array value', () => {
    const input = { items: 'not array' };
    expectSameErrors(baker.deserialize(Cart, input), baker.validate(Cart, input), 'array non-array');
  });

  it('null item in array', () => {
    const input = { items: [null, { name: 'ok', price: 1 }] };
    expectSameErrors(baker.deserialize(Cart, input), baker.validate(Cart, input), 'array null item');
  });

  it('non-object item in array', () => {
    const input = { items: [42, { name: 'ok', price: 1 }] };
    expectSameErrors(baker.deserialize(Cart, input), baker.validate(Cart, input), 'array non-obj item');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Deep nesting (5 levels)
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — deep nesting (5 levels)', () => {
  const baker = new Baker();
  @baker.Recipe
  class L4 {
    @Field(isString) v!: string;
  }
  @baker.Recipe
  class L3 {
    @Field({ type: () => L4 }) c!: L4;
  }
  @baker.Recipe
  class L2 {
    @Field({ type: () => L3 }) c!: L3;
  }
  @baker.Recipe
  class L1 {
    @Field({ type: () => L2 }) c!: L2;
  }
  @baker.Recipe
  class Root {
    @Field({ type: () => L1 }) c!: L1;
  }

  baker.seal();

  it('valid', () => {
    const input = { c: { c: { c: { c: { v: 'deep' } } } } };
    expectSameErrors(baker.deserialize(Root, input), baker.validate(Root, input), 'deep valid');
  });

  it('error at deepest level', () => {
    const input = { c: { c: { c: { c: { v: 123 } } } } };
    expectSameErrors(baker.deserialize(Root, input), baker.validate(Root, input), 'deep error');
  });

  it('missing at mid level', () => {
    const input = { c: { c: { c: null } } };
    expectSameErrors(baker.deserialize(Root, input), baker.validate(Root, input), 'deep mid null');
  });

  it('missing at top level', () => {
    const input = {};
    expectSameErrors(baker.deserialize(Root, input), baker.validate(Root, input), 'deep missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Very deep nesting (11 levels) — matches chaos test
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — very deep nesting (11 levels)', () => {
  const baker = new Baker();
  @baker.Recipe
  class L10 {
    @Field(isString) v!: string;
  }
  @baker.Recipe
  class L9 {
    @Field({ type: () => L10 }) c!: L10;
  }
  @baker.Recipe
  class L8 {
    @Field({ type: () => L9 }) c!: L9;
  }
  @baker.Recipe
  class L7 {
    @Field({ type: () => L8 }) c!: L8;
  }
  @baker.Recipe
  class L6 {
    @Field({ type: () => L7 }) c!: L7;
  }
  @baker.Recipe
  class L5 {
    @Field({ type: () => L6 }) c!: L6;
  }
  @baker.Recipe
  class L4 {
    @Field({ type: () => L5 }) c!: L5;
  }
  @baker.Recipe
  class L3 {
    @Field({ type: () => L4 }) c!: L4;
  }
  @baker.Recipe
  class L2 {
    @Field({ type: () => L3 }) c!: L3;
  }
  @baker.Recipe
  class L1 {
    @Field({ type: () => L2 }) c!: L2;
  }
  @baker.Recipe
  class Root {
    @Field({ type: () => L1 }) c!: L1;
  }

  baker.seal();

  it('valid 11-level', () => {
    const input = { c: { c: { c: { c: { c: { c: { c: { c: { c: { c: { v: 'deep' } } } } } } } } } } };
    expectSameErrors(baker.deserialize(Root, input), baker.validate(Root, input), '11-level valid');
  });

  it('error at level 11', () => {
    const input = { c: { c: { c: { c: { c: { c: { c: { c: { c: { c: { v: 999 } } } } } } } } } } };
    expectSameErrors(baker.deserialize(Root, input), baker.validate(Root, input), '11-level error');
  });

  it('error path matches c.c.c.c.c.c.c.c.c.c.v', () => {
    const input = { c: { c: { c: { c: { c: { c: { c: { c: { c: { c: { v: 999 } } } } } } } } } } };
    const result = baker.validate(Root, input);
    assertBakerIssueSet(result);
    expect(result.errors[0]!.path).toBe('c.c.c.c.c.c.c.c.c.c.v');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Nested array within nested object
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — nested array within nested object', () => {
  const baker = new Baker();
  @baker.Recipe
  class Tag {
    @Field(isString) label!: string;
  }
  @baker.Recipe
  class Product {
    @Field(isString) name!: string;
    @Field({ type: () => [Tag] }) tags!: Tag[];
  }
  @baker.Recipe
  class Store {
    @Field(isString) storeName!: string;
    @Field({ type: () => [Product] }) products!: Product[];
  }

  baker.seal();

  it('valid', () => {
    const input = {
      storeName: 'Shop',
      products: [
        { name: 'Widget', tags: [{ label: 'hot' }] },
        { name: 'Gadget', tags: [{ label: 'new' }, { label: 'sale' }] },
      ],
    };
    expectSameErrors(baker.deserialize(Store, input), baker.validate(Store, input), 'nested-array valid');
  });

  it('errors in deeply nested items', () => {
    const input = {
      storeName: 'Shop',
      products: [
        { name: 'Widget', tags: [{ label: 123 }] },
        { name: 'Gadget', tags: [{ label: 'ok' }, { label: null }] },
      ],
    };
    expectSameErrors(baker.deserialize(Store, input), baker.validate(Store, input), 'nested-array errors');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Optional/Nullable nested fields
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — optional/nullable nested', () => {
  const baker = new Baker();
  @baker.Recipe
  class Inner {
    @Field(isString) val!: string;
  }
  @baker.Recipe
  class Outer {
    @Field(isString) name!: string;
    @Field({ optional: true, type: () => Inner }) opt?: Inner;
    @Field({ nullable: true, type: () => Inner }) nul!: Inner | null;
  }

  baker.seal();

  it('all present', () => {
    const input = { name: 'x', opt: { val: 'a' }, nul: { val: 'b' } };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'opt/nul present');
  });

  it('optional absent', () => {
    const input = { name: 'x', nul: { val: 'b' } };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'opt absent');
  });

  it('nullable is null', () => {
    const input = { name: 'x', nul: null };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'nul is null');
  });

  it('nullable missing', () => {
    const input = { name: 'x' };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'nul missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Mixed: flat + nested + array in same DTO
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — mixed DTO', () => {
  const baker = new Baker();
  @baker.Recipe
  class Coord {
    @Field(isNumber()) lat!: number;
    @Field(isNumber()) lng!: number;
  }
  @baker.Recipe
  class Label {
    @Field(isString) text!: string;
  }
  @baker.Recipe
  class Marker {
    @Field(isString, minLength(1)) title!: string;
    @Field(isNumber(), min(0), max(100)) priority!: number;
    @Field({ type: () => Coord }) position!: Coord;
    @Field({ type: () => [Label] }) labels!: Label[];
  }

  baker.seal();

  it('valid', () => {
    const input = {
      title: 'HQ',
      priority: 50,
      position: { lat: 37.7, lng: -122.4 },
      labels: [{ text: 'main' }, { text: 'office' }],
    };
    expectSameErrors(baker.deserialize(Marker, input), baker.validate(Marker, input), 'mixed valid');
  });

  it('multiple errors across levels', () => {
    const input = {
      title: '',
      priority: 200,
      position: { lat: 'bad', lng: null },
      labels: [{ text: 42 }, {}],
    };
    expectSameErrors(baker.deserialize(Marker, input), baker.validate(Marker, input), 'mixed errors');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. stopAtFirstError mode
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — stopAtFirstError', () => {
  const sb = new Baker({ stopAtFirstError: true });
  @sb.Recipe
  class Inner {
    @Field(isString) v!: string;
  }
  @sb.Recipe
  class Root {
    @Field({ type: () => [Inner] }) items!: Inner[];
  }
  sb.seal();

  it('stopAtFirstError returns single error', () => {
    const input = { items: [{ v: 1 }, { v: 2 }] };
    const desResult = sb.deserialize(Root, input);
    const valResult = sb.validate(Root, input);
    expect(isBakerIssueSet(desResult)).toBe(true);
    expect(isBakerIssueSet(valResult)).toBe(true);
    assertBakerIssueSet(desResult);
    assertBakerIssueSet(valResult);
    // Both should have exactly 1 error
    expect(desResult.errors.length).toBe(1);
    expect(valResult.errors.length).toBe(1);
    expect(valResult.errors[0]!.path).toBe(desResult.errors[0]!.path);
    expect(valResult.errors[0]!.code).toBe(desResult.errors[0]!.code);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. invalidInput edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — invalidInput', () => {
  const baker = new Baker();
  @baker.Recipe
  class Dto {
    @Field(isString) x!: string;
  }

  baker.seal();

  it('null input', () => {
    expectSameErrors(baker.deserialize(Dto, null), baker.validate(Dto, null), 'null');
  });
  it('undefined input', () => {
    expectSameErrors(baker.deserialize(Dto, undefined), baker.validate(Dto, undefined), 'undefined');
  });
  it('array input', () => {
    expectSameErrors(baker.deserialize(Dto, [1, 2]), baker.validate(Dto, [1, 2]), 'array');
  });
  it('string input', () => {
    expectSameErrors(baker.deserialize(Dto, 'hello'), baker.validate(Dto, 'hello'), 'string');
  });
  it('number input', () => {
    expectSameErrors(baker.deserialize(Dto, 42), baker.validate(Dto, 42), 'number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Discriminator nested
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — discriminator', () => {
  const baker = new Baker();
  @baker.Recipe
  class Dog {
    @Field(isString) breed!: string;
  }
  @baker.Recipe
  class Cat {
    @Field(isString) color!: string;
  }
  @baker.Recipe
  class Owner {
    @Field(isString) name!: string;
    @Field({
      type: () => Object,
      discriminator: {
        property: 'kind',
        subTypes: [
          { name: 'dog', value: Dog },
          { name: 'cat', value: Cat },
        ],
      },
    })
    pet!: Dog | Cat;
  }

  baker.seal();

  it('valid dog', () => {
    const input = { name: 'Alice', pet: { kind: 'dog', breed: 'poodle' } };
    expectSameErrors(baker.deserialize(Owner, input), baker.validate(Owner, input), 'disc dog');
  });

  it('valid cat', () => {
    const input = { name: 'Bob', pet: { kind: 'cat', color: 'black' } };
    expectSameErrors(baker.deserialize(Owner, input), baker.validate(Owner, input), 'disc cat');
  });

  it('invalid discriminator value', () => {
    const input = { name: 'Eve', pet: { kind: 'fish' } };
    expectSameErrors(baker.deserialize(Owner, input), baker.validate(Owner, input), 'disc invalid');
  });

  it('invalid nested field in discriminated type', () => {
    const input = { name: 'Eve', pet: { kind: 'dog', breed: 123 } };
    expectSameErrors(baker.deserialize(Owner, input), baker.validate(Owner, input), 'disc nested invalid');
  });

  it('missing discriminator property', () => {
    const input = { name: 'Eve', pet: { breed: 'poodle' } };
    expectSameErrors(baker.deserialize(Owner, input), baker.validate(Owner, input), 'disc missing prop');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. @Transform + nested
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — transform + nested', () => {
  const baker = new Baker();
  @baker.Recipe
  class Inner {
    @Field(isNumber()) val!: number;
  }
  @baker.Recipe
  class Outer {
    @Field(isString, {
      transform: {
        deserialize: ({ value }) => (value as string).trim(),
        serialize: ({ value }) => value,
      },
    })
    name!: string;
    @Field({ type: () => Inner }) nested!: Inner;
  }

  baker.seal();

  it('valid with transform', () => {
    const input = { name: '  hello  ', nested: { val: 42 } };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'transform valid');
  });

  it('invalid after transform', () => {
    const input = { name: '  hello  ', nested: { val: 'bad' } };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'transform invalid');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. @Expose name mapping + nested
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — @Field name mapping', () => {
  const baker = new Baker();
  @baker.Recipe
  class Inner {
    @Field(isString) v!: string;
  }
  @baker.Recipe
  class Outer {
    @Field(isString, { name: 'user_name' }) userName!: string;
    @Field({ type: () => Inner, name: 'nested_obj' }) nested!: Inner;
  }

  baker.seal();

  it('valid with mapped names', () => {
    const input = { user_name: 'Alice', nested_obj: { v: 'ok' } };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'name-map valid');
  });

  it('invalid — uses original key (should fail)', () => {
    const input = { userName: 'Alice', nested: { v: 'ok' } };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'name-map wrong key');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. groups + nested
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — groups', () => {
  const baker = new Baker();
  @baker.Recipe
  class Inner {
    @Field(isString) v!: string;
  }
  @baker.Recipe
  class Outer {
    @Field(isString) name!: string;
    @Field(isString, { groups: ['admin'] }) secret!: string;
    @Field({ type: () => Inner }) nested!: Inner;
  }

  baker.seal();

  it('with admin group', () => {
    const input = { name: 'A', secret: 'S', nested: { v: 'ok' } };
    expectSameErrors(
      baker.deserialize(Outer, input, { groups: ['admin'] }),
      baker.validate(Outer, input, { groups: ['admin'] }),
      'groups admin',
    );
  });

  it('without admin group — secret not validated', () => {
    const input = { name: 'A', secret: 123, nested: { v: 'ok' } };
    expectSameErrors(
      baker.deserialize(Outer, input, { groups: ['user'] }),
      baker.validate(Outer, input, { groups: ['user'] }),
      'groups user',
    );
  });

  it('no groups option', () => {
    const input = { name: 'A', secret: 'S', nested: { v: 'ok' } };
    expectSameErrors(baker.deserialize(Outer, input), baker.validate(Outer, input), 'groups none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. autoConvert + nested
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — autoConvert', () => {
  const ab = new Baker({ autoConvert: true });
  @ab.Recipe
  class Inner {
    @Field(isNumber()) val!: number;
  }
  @ab.Recipe
  class Outer {
    @Field(isNumber()) age!: number;
    @Field({ type: () => Inner }) nested!: Inner;
  }
  ab.seal();

  it('string-to-number conversion', () => {
    const input = { age: '25', nested: { val: '42' } };
    expectSameErrors(ab.deserialize(Outer, input), ab.validate(Outer, input), 'conversion valid');
  });

  it('non-convertible value', () => {
    const input = { age: 'abc', nested: { val: 'xyz' } };
    expectSameErrors(ab.deserialize(Outer, input), ab.validate(Outer, input), 'conversion invalid');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Circular reference (fallback to validate)
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — circular reference', () => {
  const baker = new Baker();
  @baker.Recipe
  class TreeNode {
    @Field(isString) name!: string;
    @Field({ optional: true, type: () => TreeNode }) child?: TreeNode;
  }

  baker.seal();

  it('valid tree', () => {
    const input = { name: 'root', child: { name: 'leaf' } };
    expectSameErrors(baker.deserialize(TreeNode, input), baker.validate(TreeNode, input), 'circular valid');
  });

  it('valid deep tree', () => {
    const input = { name: 'a', child: { name: 'b', child: { name: 'c' } } };
    expectSameErrors(baker.deserialize(TreeNode, input), baker.validate(TreeNode, input), 'circular deep');
  });

  it('invalid at depth', () => {
    const input = { name: 'a', child: { name: 'b', child: { name: 123 } } };
    expectSameErrors(baker.deserialize(TreeNode, input), baker.validate(TreeNode, input), 'circular invalid');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Circular reference — array of self (fallback path coverage)
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — circular array of self', () => {
  const baker = new Baker();
  @baker.Recipe
  class TreeNode {
    @Field(isString) name!: string;
    @Field({ optional: true, type: () => [TreeNode] }) children?: TreeNode[];
  }

  baker.seal();

  it('valid tree with children array', () => {
    const input = { name: 'root', children: [{ name: 'a' }, { name: 'b', children: [{ name: 'c' }] }] };
    expectSameErrors(baker.deserialize(TreeNode, input), baker.validate(TreeNode, input), 'circular array valid');
  });

  it('invalid child in array', () => {
    const input = { name: 'root', children: [{ name: 123 }] };
    expectSameErrors(baker.deserialize(TreeNode, input), baker.validate(TreeNode, input), 'circular array invalid');
  });

  it('deep circular tree', () => {
    const input = { name: 'a', children: [{ name: 'b', children: [{ name: 'c', children: [{ name: 'd' }] }] }] };
    expectSameErrors(baker.deserialize(TreeNode, input), baker.validate(TreeNode, input), 'circular array deep');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Discriminator array (each)
// ─────────────────────────────────────────────────────────────────────────────

describe('validate inline parity — discriminator array', () => {
  const baker = new Baker();
  @baker.Recipe
  class Dog {
    @Field(isString) breed!: string;
  }
  @baker.Recipe
  class Cat {
    @Field(isString) color!: string;
  }
  @baker.Recipe
  class Shelter {
    @Field({
      type: () => [Object],
      discriminator: {
        property: 'kind',
        subTypes: [
          { name: 'dog', value: Dog },
          { name: 'cat', value: Cat },
        ],
      },
    })
    animals!: (Dog | Cat)[];
  }

  baker.seal();

  it('valid array', () => {
    const input = {
      animals: [
        { kind: 'dog', breed: 'lab' },
        { kind: 'cat', color: 'white' },
      ],
    };
    expectSameErrors(baker.deserialize(Shelter, input), baker.validate(Shelter, input), 'disc array valid');
  });

  it('invalid items', () => {
    const input = { animals: [{ kind: 'dog', breed: 123 }, { kind: 'fish' }] };
    expectSameErrors(baker.deserialize(Shelter, input), baker.validate(Shelter, input), 'disc array invalid');
  });
});
