// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: validate() vs deserialize() — prove Object.create elimination
// ─────────────────────────────────────────────────────────────────────────────
import { bench, group, run } from 'mitata';
import { NESTED_VALID, NESTED_INVALID } from './data';

// ── Baker ────────────────────────────────────────────────────────────────────
import { Field, deserialize, validate } from '../index';
import { isString, isNumber, min, minLength, arrayMinSize } from '../src/rules/index';

class BkAddr {
  @Field(isString, minLength(1)) street!: string;
  @Field(isString, minLength(1)) city!: string;
  @Field(isString, minLength(1)) zip!: string;
}
class BkCust {
  @Field(isString, minLength(1)) name!: string;
  @Field(isString) email!: string;
  @Field({ type: () => BkAddr }) address!: BkAddr;
}
class BkOrder {
  @Field(isString, minLength(1)) title!: string;
  @Field({ type: () => BkCust }) customer!: BkCust;
  @Field(isNumber(), min(0)) priority!: number;
}

// Array benchmark DTO
class BkItem {
  @Field(isString, minLength(1)) name!: string;
  @Field(isNumber(), min(0)) price!: number;
}
class BkCart {
  @Field(arrayMinSize(1), { type: () => [BkItem] }) items!: BkItem[];
}

// Warm seal
deserialize(BkOrder, NESTED_VALID);
const cartInput = { items: Array.from({ length: 1000 }, (_, i) => ({ name: `item${i}`, price: i })) };
deserialize(BkCart, cartInput);

// ── TypeBox (validate-only baseline) ─────────────────────────────────────────
import { Type as T } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const tbOrder = T.Object({
  title: T.String({ minLength: 1 }),
  customer: T.Object({
    name: T.String({ minLength: 1 }),
    email: T.String(),
    address: T.Object({
      street: T.String({ minLength: 1 }),
      city: T.String({ minLength: 1 }),
      zip: T.String({ minLength: 1 }),
    }),
  }),
  priority: T.Number({ minimum: 0 }),
});
const tbCheck = TypeCompiler.Compile(tbOrder);

const tbCart = T.Object({
  items: T.Array(T.Object({
    name: T.String({ minLength: 1 }),
    price: T.Number({ minimum: 0 }),
  }), { minItems: 1 }),
});
const tbCartCheck = TypeCompiler.Compile(tbCart);

// ── AJV ──────────────────────────────────────────────────────────────────────
import Ajv from 'ajv';
const ajv = new Ajv({ allErrors: true });
const ajvCart = ajv.compile({
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', minLength: 1 },
          price: { type: 'number', minimum: 0 },
        },
      },
    },
  },
});

let sink: unknown;

group('nested 3-level — validate vs deserialize', () => {
  bench('baker validate()', () => {
    sink = validate(BkOrder, NESTED_VALID);
  });
  bench('baker deserialize()', () => {
    sink = deserialize(BkOrder, NESTED_VALID);
  });
  bench('typebox Check()', () => {
    sink = tbCheck.Check(NESTED_VALID);
  });
});

group('array 1000 items — validate vs deserialize', () => {
  bench('baker validate()', () => {
    sink = validate(BkCart, cartInput);
  });
  bench('baker deserialize()', () => {
    sink = deserialize(BkCart, cartInput);
  });
  bench('typebox Check()', () => {
    sink = tbCartCheck.Check(cartInput);
  });
  bench('ajv validate()', () => {
    sink = ajvCart(cartInput);
  });
});

group('nested 3-level — invalid', () => {
  bench('baker validate()', () => {
    sink = validate(BkOrder, NESTED_INVALID);
  });
  bench('baker deserialize()', () => {
    sink = deserialize(BkOrder, NESTED_INVALID);
  });
});

await run();
