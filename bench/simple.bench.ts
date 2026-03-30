// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Simple flat object (5 fields) — valid + invalid
// ─────────────────────────────────────────────────────────────────────────────
import { bench, group, run } from 'mitata';
import { SIMPLE_VALID, SIMPLE_INVALID } from './data';

// ── Baker ────────────────────────────────────────────────────────────────────
import { Field, deserialize } from '../index';
import { isString, isEmail, isNumber, isBoolean, min, max, minLength } from '../src/rules/index';

class BakerSimple {
  @Field(isString, minLength(2)) name!: string;
  @Field(isString, isEmail()) email!: string;
  @Field(isNumber(), min(0), max(150)) age!: number;
  @Field(isBoolean) active!: boolean;
  @Field(isString) tag!: string;
}
// warm seal
await deserialize(BakerSimple, SIMPLE_VALID);

// ── class-validator ──────────────────────────────────────────────────────────
import 'reflect-metadata';
import { IsString, IsEmail, IsNumber, IsBoolean, Min, Max, MinLength, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class CvSimple {
  @IsString() @MinLength(2) name!: string;
  @IsString() @IsEmail() email!: string;
  @IsNumber() @Min(0) @Max(150) age!: number;
  @IsBoolean() active!: boolean;
  @IsString() tag!: string;
}

// ── Zod ──────────────────────────────────────────────────────────────────────
import { z } from 'zod';

const zodSimple = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().min(0).max(150),
  active: z.boolean(),
  tag: z.string(),
});

// ── Valibot ──────────────────────────────────────────────────────────────────
import * as v from 'valibot';

const valibotSimple = v.object({
  name: v.pipe(v.string(), v.minLength(2)),
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.minValue(0), v.maxValue(150)),
  active: v.boolean(),
  tag: v.string(),
});

// ── AJV ──────────────────────────────────────────────────────────────────────
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });
const ajvSimple = ajv.compile({
  type: 'object',
  required: ['name', 'email', 'age', 'active', 'tag'],
  properties: {
    name: { type: 'string', minLength: 2 },
    email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
    age: { type: 'number', minimum: 0, maximum: 150 },
    active: { type: 'boolean' },
    tag: { type: 'string' },
  },
  additionalProperties: false,
});

// ── TypeBox + AJV ────────────────────────────────────────────────────────────
import { Type as T } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const tbSimple = T.Object({
  name: T.String({ minLength: 2 }),
  email: T.String({ pattern: '^[^@]+@[^@]+\\.[^@]+$' }),
  age: T.Number({ minimum: 0, maximum: 150 }),
  active: T.Boolean(),
  tag: T.String(),
});
const tbCheck = TypeCompiler.Compile(tbSimple);

// ── ArkType ──────────────────────────────────────────────────────────────────
import { type } from 'arktype';

const arkSimple = type({
  name: 'string >= 2',
  email: 'string.email',
  age: '0 <= number <= 150',
  active: 'boolean',
  tag: 'string',
});

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

// Sink to prevent dead-code elimination
let sink: unknown;

group('simple object — valid input', () => {
  bench('baker', () => {
    sink = deserialize(BakerSimple, SIMPLE_VALID);
  });
  bench('class-validator', async () => {
    const inst = plainToInstance(CvSimple, SIMPLE_VALID);
    sink = await validateSync(inst);
  });
  bench('zod', async () => {
    sink = await zodSimple.parse(SIMPLE_VALID);
  });
  bench('valibot', async () => {
    sink = await v.parse(valibotSimple, SIMPLE_VALID);
  });
  bench('ajv', async () => {
    sink = await ajvSimple(SIMPLE_VALID);
  });
  bench('typebox', async () => {
    sink = await tbCheck.Check(SIMPLE_VALID);
  });
  bench('arktype', async () => {
    sink = await arkSimple(SIMPLE_VALID);
  });
});

group('simple object — invalid input', () => {
  bench('baker', () => {
    sink = deserialize(BakerSimple, SIMPLE_INVALID);
  });
  bench('class-validator', async () => {
    const inst = plainToInstance(CvSimple, SIMPLE_INVALID);
    sink = await validateSync(inst);
  });
  bench('zod', async () => {
    sink = await zodSimple.safeParse(SIMPLE_INVALID);
  });
  bench('valibot', async () => {
    sink = await v.safeParse(valibotSimple, SIMPLE_INVALID);
  });
  bench('ajv', async () => {
    sink = await ajvSimple(SIMPLE_INVALID);
  });
  bench('typebox', async () => {
    sink = await tbCheck.Check(SIMPLE_INVALID);
  });
  bench('arktype', async () => {
    sink = arkSimple(SIMPLE_INVALID);
  });
});

await run();
