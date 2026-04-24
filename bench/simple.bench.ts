// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Simple flat object (5 fields) — valid + invalid
// ─────────────────────────────────────────────────────────────────────────────
import { bench, group, run } from 'mitata';
import { SIMPLE_VALID, SIMPLE_INVALID } from './data';

// ── Baker ────────────────────────────────────────────────────────────────────
import { Field, deserialize, isBakerError } from '../index';
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

// ─────────────────────────────────────────────────────────────────────────────
// Fair-comparison helpers
//
// Each bench function must perform equivalent effective work:
//   - valid path: validate + return a typed/successful result
//   - invalid path: validate + materialise an error list (not just a bool)
//
// `sinkNum` accumulates a primitive from every iteration so that JIT cannot
// dead-code-eliminate the validation call (observed on typebox Check()).
// ─────────────────────────────────────────────────────────────────────────────

let sinkNum = 0;

group('simple object — valid input', () => {
  bench('baker', () => {
    const r = deserialize(BakerSimple, SIMPLE_VALID);
    if (isBakerError(r)) sinkNum += r.errors.length; else sinkNum += r.tag.length;
  });
  bench('class-validator', () => {
    const inst = plainToInstance(CvSimple, SIMPLE_VALID);
    const errs = validateSync(inst);
    sinkNum += errs.length;
  });
  bench('zod', () => {
    const r = zodSimple.safeParse(SIMPLE_VALID);
    sinkNum += r.success ? r.data.tag.length : r.error.issues.length;
  });
  bench('valibot', () => {
    const r = v.safeParse(valibotSimple, SIMPLE_VALID);
    sinkNum += r.success ? r.output.tag.length : r.issues.length;
  });
  bench('ajv', () => {
    const ok = ajvSimple(SIMPLE_VALID);
    sinkNum += ok ? 1 : (ajvSimple.errors?.length ?? 0);
  });
  bench('typebox', () => {
    const ok = tbCheck.Check(SIMPLE_VALID);
    if (ok) sinkNum += 1;
    else for (const _ of tbCheck.Errors(SIMPLE_VALID)) sinkNum += 1;
  });
  bench('arktype', () => {
    const r = arkSimple(SIMPLE_VALID);
    sinkNum += r instanceof type.errors ? r.length : (r as { tag: string }).tag.length;
  });
});

group('simple object — invalid input', () => {
  bench('baker', () => {
    const r = deserialize(BakerSimple, SIMPLE_INVALID);
    if (isBakerError(r)) sinkNum += r.errors.length; else sinkNum += 1;
  });
  bench('class-validator', () => {
    const inst = plainToInstance(CvSimple, SIMPLE_INVALID);
    const errs = validateSync(inst);
    sinkNum += errs.length;
  });
  bench('zod', () => {
    const r = zodSimple.safeParse(SIMPLE_INVALID);
    sinkNum += r.success ? 1 : r.error.issues.length;
  });
  bench('valibot', () => {
    const r = v.safeParse(valibotSimple, SIMPLE_INVALID);
    sinkNum += r.success ? 1 : r.issues.length;
  });
  bench('ajv', () => {
    const ok = ajvSimple(SIMPLE_INVALID);
    sinkNum += ok ? 1 : (ajvSimple.errors?.length ?? 0);
  });
  bench('typebox', () => {
    const ok = tbCheck.Check(SIMPLE_INVALID);
    if (ok) sinkNum += 1;
    else for (const _ of tbCheck.Errors(SIMPLE_INVALID)) sinkNum += 1;
  });
  bench('arktype', () => {
    const r = arkSimple(SIMPLE_INVALID);
    sinkNum += r instanceof type.errors ? r.length : 1;
  });
});

await run();
// Force observation of sinkNum so the compiler cannot hoist iterations away.
if (sinkNum === -1) console.log('unreachable', sinkNum);
