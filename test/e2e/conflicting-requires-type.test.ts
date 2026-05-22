import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, Recipe, deserialize, seal } from '../../index';
import { isString } from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// @Type alone works (auto-nested) — @ValidateNested is removed
// ─────────────────────────────────────────────────────────────────────────────

describe('auto-nested via @Type', () => {
  it('@Field({ type }) alone triggers nested validation without @ValidateNested', async () => {
    @Recipe
    class Inner {
      @Field(isString)
      label!: string;
    }
    sealClass(Inner);

    @Recipe
    class Outer {
      @Field({ type: () => Inner })
      child!: Inner;
    }
    sealClass(Outer);

    const result = (await deserialize<Outer>(Outer, { child: { label: 'hello' } })) as Outer;
    expect(result.child).toBeInstanceOf(Inner);
    expect(result.child.label).toBe('hello');
  });
});
