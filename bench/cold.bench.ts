// ─────────────────────────────────────────────────────────────────────────────
// Benchmark: Cold start — schema definition + first validation (compile cost)
// ─────────────────────────────────────────────────────────────────────────────
import { bench, group, run } from 'mitata';

const input = { name: 'Alice', email: 'alice@example.com', age: 30, active: true, tag: 'ok' };

// ── Baker ────────────────────────────────────────────────────────────────────
// Baker's seal is one-time per class. To measure cold start, we use unseal helper.
import { unseal } from '../test/integration/helpers/unseal';
import { Field, deserialize } from '../index';
import { isString, isEmail, isNumber, isBoolean, min, max, minLength } from '../src/rules/index';

class BakerCold {
  @Field(isString, minLength(2)) name!: string;
  @Field(isString, isEmail()) email!: string;
  @Field(isNumber(), min(0), max(150)) age!: number;
  @Field(isBoolean) active!: boolean;
  @Field(isString) tag!: string;
}
// warm once to verify correctness
await deserialize(BakerCold, input);

// ── class-validator ──────────────────────────────────────────────────────────
import 'reflect-metadata';

// ── Zod ──────────────────────────────────────────────────────────────────────
import { z } from 'zod';

// ── Valibot ──────────────────────────────────────────────────────────────────
import * as v from 'valibot';

// ── AJV ──────────────────────────────────────────────────────────────────────
import Ajv from 'ajv';

// ── TypeBox ──────────────────────────────────────────────────────────────────
import { Type as T } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

// ── ArkType ──────────────────────────────────────────────────────────────────
import { type } from 'arktype';

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks — measure "define schema + compile + first validate" cycle
// ─────────────────────────────────────────────────────────────────────────────

group('cold start — schema define + compile + first validate', () => {
  bench('baker (unseal + re-seal + validate)', async () => {
    unseal();
    await deserialize(BakerCold, input);
  });

  bench('zod (define + parse)', () => {
    const s = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      age: z.number().min(0).max(150),
      active: z.boolean(),
      tag: z.string(),
    });
    s.parse(input);
  });

  bench('valibot (define + parse)', () => {
    const s = v.object({
      name: v.pipe(v.string(), v.minLength(2)),
      email: v.pipe(v.string(), v.email()),
      age: v.pipe(v.number(), v.minValue(0), v.maxValue(150)),
      active: v.boolean(),
      tag: v.string(),
    });
    v.parse(s, input);
  });

  bench('ajv (define + compile + validate)', () => {
    const a = new Ajv();
    const validate = a.compile({
      type: 'object',
      required: ['name', 'email', 'age', 'active', 'tag'],
      properties: {
        name: { type: 'string', minLength: 2 },
        email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        age: { type: 'number', minimum: 0, maximum: 150 },
        active: { type: 'boolean' },
        tag: { type: 'string' },
      },
    });
    validate(input);
  });

  bench('typebox (define + compile + validate)', () => {
    const s = T.Object({
      name: T.String({ minLength: 2 }),
      email: T.String({ pattern: '^[^@]+@[^@]+\\.[^@]+$' }),
      age: T.Number({ minimum: 0, maximum: 150 }),
      active: T.Boolean(),
      tag: T.String(),
    });
    const c = TypeCompiler.Compile(s);
    c.Check(input);
  });

  bench('arktype (define + validate)', () => {
    const s = type({
      name: 'string >= 2',
      email: 'string.email',
      age: '0 <= number <= 150',
      active: 'boolean',
      tag: 'string',
    });
    s(input);
  });
});

await run();
