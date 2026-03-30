// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Array of 1000 objects — valid
// ─────────────────────────────────────────────────────────────────────────────
import { bench, group, run } from 'mitata';
import { ARRAY_VALID } from './data';

// ── Baker ────────────────────────────────────────────────────────────────────
import { Field, deserialize } from '../index';
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

let sink: unknown;

group('array 1000 items — valid input', () => {
  bench('baker', async () => {
    sink = await deserialize(BakerList, ARRAY_VALID);
  });
  bench('class-validator', () => {
    const inst = plainToInstance(CvList, ARRAY_VALID);
    sink = validateSync(inst);
  });
  bench('zod', () => {
    sink = zodList.parse(ARRAY_VALID);
  });
  bench('valibot', () => {
    sink = v.parse(vList, ARRAY_VALID);
  });
  bench('ajv', () => {
    sink = ajvList(ARRAY_VALID);
  });
  bench('typebox', () => {
    sink = tbCheck.Check(ARRAY_VALID);
  });
  bench('arktype', () => {
    sink = arkList(ARRAY_VALID);
  });
});

await run();
