// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Error collection — 10 fields, all invalid
// ─────────────────────────────────────────────────────────────────────────────
import { bench, group, run } from 'mitata';
import { ERROR_ALL_FAIL } from './data';

// ── Baker ────────────────────────────────────────────────────────────────────
import { Field, deserialize, configure } from '../index';
import { isNumber, min } from '../src/rules/index';

configure({ stopAtFirstError: false });

class BakerErrors {
  @Field(isNumber(), min(1)) f0!: number;
  @Field(isNumber(), min(1)) f1!: number;
  @Field(isNumber(), min(1)) f2!: number;
  @Field(isNumber(), min(1)) f3!: number;
  @Field(isNumber(), min(1)) f4!: number;
  @Field(isNumber(), min(1)) f5!: number;
  @Field(isNumber(), min(1)) f6!: number;
  @Field(isNumber(), min(1)) f7!: number;
  @Field(isNumber(), min(1)) f8!: number;
  @Field(isNumber(), min(1)) f9!: number;
}
// warm seal
await deserialize(BakerErrors, ERROR_ALL_FAIL);

// ── class-validator ──────────────────────────────────────────────────────────
import 'reflect-metadata';
import { IsNumber, Min, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class CvErrors {
  @IsNumber() @Min(1) f0!: number;
  @IsNumber() @Min(1) f1!: number;
  @IsNumber() @Min(1) f2!: number;
  @IsNumber() @Min(1) f3!: number;
  @IsNumber() @Min(1) f4!: number;
  @IsNumber() @Min(1) f5!: number;
  @IsNumber() @Min(1) f6!: number;
  @IsNumber() @Min(1) f7!: number;
  @IsNumber() @Min(1) f8!: number;
  @IsNumber() @Min(1) f9!: number;
}

// ── Zod ──────────────────────────────────────────────────────────────────────
import { z } from 'zod';

const zodErrors = z.object({
  f0: z.number().min(1), f1: z.number().min(1),
  f2: z.number().min(1), f3: z.number().min(1),
  f4: z.number().min(1), f5: z.number().min(1),
  f6: z.number().min(1), f7: z.number().min(1),
  f8: z.number().min(1), f9: z.number().min(1),
});

// ── Valibot ──────────────────────────────────────────────────────────────────
import * as v from 'valibot';

const vErrors = v.object({
  f0: v.pipe(v.number(), v.minValue(1)), f1: v.pipe(v.number(), v.minValue(1)),
  f2: v.pipe(v.number(), v.minValue(1)), f3: v.pipe(v.number(), v.minValue(1)),
  f4: v.pipe(v.number(), v.minValue(1)), f5: v.pipe(v.number(), v.minValue(1)),
  f6: v.pipe(v.number(), v.minValue(1)), f7: v.pipe(v.number(), v.minValue(1)),
  f8: v.pipe(v.number(), v.minValue(1)), f9: v.pipe(v.number(), v.minValue(1)),
});

// ── AJV ──────────────────────────────────────────────────────────────────────
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });
const props: Record<string, object> = {};
const required: string[] = [];
for (let i = 0; i < 10; i++) {
  props[`f${i}`] = { type: 'number', minimum: 1 };
  required.push(`f${i}`);
}
const ajvErrors = ajv.compile({ type: 'object', required, properties: props });

// ── TypeBox ──────────────────────────────────────────────────────────────────
import { Type as T } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const tbErrors = T.Object({
  f0: T.Number({ minimum: 1 }), f1: T.Number({ minimum: 1 }),
  f2: T.Number({ minimum: 1 }), f3: T.Number({ minimum: 1 }),
  f4: T.Number({ minimum: 1 }), f5: T.Number({ minimum: 1 }),
  f6: T.Number({ minimum: 1 }), f7: T.Number({ minimum: 1 }),
  f8: T.Number({ minimum: 1 }), f9: T.Number({ minimum: 1 }),
});
const tbCheck = TypeCompiler.Compile(tbErrors);

// ── ArkType ──────────────────────────────────────────────────────────────────
import { type } from 'arktype';

const arkErrors = type({
  f0: 'number >= 1', f1: 'number >= 1',
  f2: 'number >= 1', f3: 'number >= 1',
  f4: 'number >= 1', f5: 'number >= 1',
  f6: 'number >= 1', f7: 'number >= 1',
  f8: 'number >= 1', f9: 'number >= 1',
});

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

let sink: unknown;

group('error collection — 10 fields all invalid', () => {
  bench('baker', () => {
    sink = deserialize(BakerErrors, ERROR_ALL_FAIL);
  });
  bench('class-validator', () => {
    const inst = plainToInstance(CvErrors, ERROR_ALL_FAIL);
    sink = validateSync(inst);
  });
  bench('zod', () => {
    sink = zodErrors.safeParse(ERROR_ALL_FAIL);
  });
  bench('valibot', () => {
    sink = v.safeParse(vErrors, ERROR_ALL_FAIL);
  });
  bench('ajv', () => {
    sink = ajvErrors(ERROR_ALL_FAIL);
  });
  bench('typebox', () => {
    sink = [...tbCheck.Errors(ERROR_ALL_FAIL)];
  });
  bench('arktype', () => {
    sink = arkErrors(ERROR_ALL_FAIL);
  });
});

await run();
