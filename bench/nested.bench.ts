// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Nested object (3 levels) — valid + invalid
// ─────────────────────────────────────────────────────────────────────────────
import { bench, group, run } from 'mitata';
import { NESTED_VALID, NESTED_INVALID } from './data';

// ── Baker ────────────────────────────────────────────────────────────────────
import { Field, deserialize, isBakerError } from '../index';
import { isString, isNumber, min, minLength } from '../src/rules/index';

class BakerAddress {
  @Field(isString, minLength(1)) street!: string;
  @Field(isString, minLength(1)) city!: string;
  @Field(isString, minLength(1)) zip!: string;
}
class BakerCustomer {
  @Field(isString, minLength(1)) name!: string;
  @Field(isString) email!: string;
  @Field({ type: () => BakerAddress }) address!: BakerAddress;
}
class BakerOrder {
  @Field(isString, minLength(1)) title!: string;
  @Field({ type: () => BakerCustomer }) customer!: BakerCustomer;
  @Field(isNumber(), min(0)) priority!: number;
}
await deserialize(BakerOrder, NESTED_VALID);

// ── class-validator ──────────────────────────────────────────────────────────
import 'reflect-metadata';
import { IsString, IsNumber, Min, MinLength, ValidateNested, validateSync } from 'class-validator';
import { plainToInstance, Type as CvType } from 'class-transformer';

class CvAddress {
  @IsString() @MinLength(1) street!: string;
  @IsString() @MinLength(1) city!: string;
  @IsString() @MinLength(1) zip!: string;
}
class CvCustomer {
  @IsString() @MinLength(1) name!: string;
  @IsString() email!: string;
  @ValidateNested() @CvType(() => CvAddress) address!: CvAddress;
}
class CvOrder {
  @IsString() @MinLength(1) title!: string;
  @ValidateNested() @CvType(() => CvCustomer) customer!: CvCustomer;
  @IsNumber() @Min(0) priority!: number;
}

// ── Zod ──────────────────────────────────────────────────────────────────────
import { z } from 'zod';

const zodAddress = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  zip: z.string().min(1),
});
const zodCustomer = z.object({
  name: z.string().min(1),
  email: z.string(),
  address: zodAddress,
});
const zodOrder = z.object({
  title: z.string().min(1),
  customer: zodCustomer,
  priority: z.number().min(0),
});

// ── Valibot ──────────────────────────────────────────────────────────────────
import * as v from 'valibot';

const vAddress = v.object({
  street: v.pipe(v.string(), v.minLength(1)),
  city: v.pipe(v.string(), v.minLength(1)),
  zip: v.pipe(v.string(), v.minLength(1)),
});
const vCustomer = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  email: v.string(),
  address: vAddress,
});
const vOrder = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
  customer: vCustomer,
  priority: v.pipe(v.number(), v.minValue(0)),
});

// ── AJV ──────────────────────────────────────────────────────────────────────
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });
const ajvOrder = ajv.compile({
  type: 'object',
  required: ['title', 'customer', 'priority'],
  properties: {
    title: { type: 'string', minLength: 1 },
    customer: {
      type: 'object',
      required: ['name', 'email', 'address'],
      properties: {
        name: { type: 'string', minLength: 1 },
        email: { type: 'string' },
        address: {
          type: 'object',
          required: ['street', 'city', 'zip'],
          properties: {
            street: { type: 'string', minLength: 1 },
            city: { type: 'string', minLength: 1 },
            zip: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    priority: { type: 'number', minimum: 0 },
  },
});

// ── TypeBox ──────────────────────────────────────────────────────────────────
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

// ── ArkType ──────────────────────────────────────────────────────────────────
import { type } from 'arktype';

const arkOrder = type({
  title: 'string >= 1',
  customer: {
    name: 'string >= 1',
    email: 'string',
    address: {
      street: 'string >= 1',
      city: 'string >= 1',
      zip: 'string >= 1',
    },
  },
  priority: 'number >= 0',
});

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

let sinkNum = 0;

group('nested 3-level — valid input', () => {
  bench('baker', () => {
    const r = deserialize(BakerOrder, NESTED_VALID);
    sinkNum += isBakerError(r) ? r.errors.length : 1;
  });
  bench('class-validator', () => {
    const inst = plainToInstance(CvOrder, NESTED_VALID);
    sinkNum += validateSync(inst).length;
  });
  bench('zod', () => {
    const r = zodOrder.safeParse(NESTED_VALID);
    sinkNum += r.success ? 1 : r.error.issues.length;
  });
  bench('valibot', () => {
    const r = v.safeParse(vOrder, NESTED_VALID);
    sinkNum += r.success ? 1 : r.issues.length;
  });
  bench('ajv', () => {
    const ok = ajvOrder(NESTED_VALID);
    sinkNum += ok ? 1 : (ajvOrder.errors?.length ?? 0);
  });
  bench('typebox', () => {
    const ok = tbCheck.Check(NESTED_VALID);
    if (ok) sinkNum += 1;
    else for (const _ of tbCheck.Errors(NESTED_VALID)) sinkNum += 1;
  });
  bench('arktype', () => {
    const r = arkOrder(NESTED_VALID);
    sinkNum += r instanceof type.errors ? r.length : 1;
  });
});

group('nested 3-level — invalid input', () => {
  bench('baker', () => {
    const r = deserialize(BakerOrder, NESTED_INVALID);
    sinkNum += isBakerError(r) ? r.errors.length : 1;
  });
  bench('class-validator', () => {
    const inst = plainToInstance(CvOrder, NESTED_INVALID);
    sinkNum += validateSync(inst).length;
  });
  bench('zod', () => {
    const r = zodOrder.safeParse(NESTED_INVALID);
    sinkNum += r.success ? 1 : r.error.issues.length;
  });
  bench('valibot', () => {
    const r = v.safeParse(vOrder, NESTED_INVALID);
    sinkNum += r.success ? 1 : r.issues.length;
  });
  bench('ajv', () => {
    const ok = ajvOrder(NESTED_INVALID);
    sinkNum += ok ? 1 : (ajvOrder.errors?.length ?? 0);
  });
  bench('typebox', () => {
    const ok = tbCheck.Check(NESTED_INVALID);
    if (ok) sinkNum += 1;
    else for (const _ of tbCheck.Errors(NESTED_INVALID)) sinkNum += 1;
  });
  bench('arktype', () => {
    const r = arkOrder(NESTED_INVALID);
    sinkNum += r instanceof type.errors ? r.length : 1;
  });
});

await run();
if (sinkNum === -1) console.log('unreachable', sinkNum);
