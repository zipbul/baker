// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Array of 1000 objects — valid
// ─────────────────────────────────────────────────────────────────────────────
import { bench, group, run } from 'mitata';
import { ARRAY_VALID } from './data';

// ── Baker ────────────────────────────────────────────────────────────────────
import { Field, deserialize, isBakerError } from '../index';
import { isString, isNumber, min, arrayMinSize } from '../src/rules/index';

class BakerItem {
  @Field(isString) name!: string;
  @Field(isNumber(), min(0)) value!: number;
}
class BakerList {
  @Field(arrayMinSize(1), { type: () => [BakerItem] }) items!: BakerItem[];
}
await deserialize(BakerList, ARRAY_VALID);

// ── class-validator ──────────────────────────────────────────────────────────
import 'reflect-metadata';
import { IsString, IsNumber, Min, ValidateNested, ArrayMinSize, validateSync } from 'class-validator';
import { plainToInstance, Type as CvType } from 'class-transformer';

class CvItem {
  @IsString() name!: string;
  @IsNumber() @Min(0) value!: number;
}
class CvList {
  @ValidateNested({ each: true }) @ArrayMinSize(1) @CvType(() => CvItem) items!: CvItem[];
}

// ── Zod ──────────────────────────────────────────────────────────────────────
import { z } from 'zod';

const zodList = z.object({
  items: z.array(z.object({
    name: z.string(),
    value: z.number().min(0),
  })).min(1),
});

// ── Valibot ──────────────────────────────────────────────────────────────────
import * as v from 'valibot';

const vList = v.object({
  items: v.pipe(v.array(v.object({
    name: v.string(),
    value: v.pipe(v.number(), v.minValue(0)),
  })), v.minLength(1)),
});

// ── AJV ──────────────────────────────────────────────────────────────────────
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });
const ajvList = ajv.compile({
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'value'],
        properties: {
          name: { type: 'string' },
          value: { type: 'number', minimum: 0 },
        },
      },
    },
  },
});

// ── TypeBox ──────────────────────────────────────────────────────────────────
import { Type as T } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const tbList = T.Object({
  items: T.Array(T.Object({
    name: T.String(),
    value: T.Number({ minimum: 0 }),
  }), { minItems: 1 }),
});
const tbCheck = TypeCompiler.Compile(tbList);

// ── ArkType ──────────────────────────────────────────────────────────────────
import { type } from 'arktype';

const arkItem = type({ name: 'string', value: 'number >= 0' });
const arkList = type({ items: arkItem.array().atLeastLength(1) });

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

let sinkNum = 0;

group('array 1000 items — valid input', () => {
  bench('baker', () => {
    const r = deserialize(BakerList, ARRAY_VALID);
    sinkNum += isBakerError(r) ? r.errors.length : (r as { items: unknown[] }).items.length;
  });
  bench('class-validator', () => {
    const inst = plainToInstance(CvList, ARRAY_VALID);
    sinkNum += validateSync(inst).length;
  });
  bench('zod', () => {
    const r = zodList.safeParse(ARRAY_VALID);
    sinkNum += r.success ? (r.data as { items: unknown[] }).items.length : r.error.issues.length;
  });
  bench('valibot', () => {
    const r = v.safeParse(vList, ARRAY_VALID);
    sinkNum += r.success ? (r.output as { items: unknown[] }).items.length : r.issues.length;
  });
  bench('ajv', () => {
    const ok = ajvList(ARRAY_VALID);
    sinkNum += ok ? 1 : (ajvList.errors?.length ?? 0);
  });
  bench('typebox', () => {
    const ok = tbCheck.Check(ARRAY_VALID);
    if (ok) sinkNum += 1;
    else for (const _ of tbCheck.Errors(ARRAY_VALID)) sinkNum += 1;
  });
  bench('arktype', () => {
    const r = arkList(ARRAY_VALID);
    sinkNum += r instanceof type.errors ? r.length : (r as { items: unknown[] }).items.length;
  });
});

await run();
if (sinkNum === -1) console.log('unreachable', sinkNum);
