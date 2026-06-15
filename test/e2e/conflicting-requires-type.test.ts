import { describe, it, expect, afterEach } from 'bun:test';

import { Field } from '../../index';
import { isString } from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────
// @Type alone works (auto-nested) — @ValidateNested is removed
// ─────────────────────────────────────────────────────────────────────────────

describe('auto-nested via @Type', () => {
  it('@Field({ type }) alone triggers nested validation without @ValidateNested', async () => {
    class Inner {
      @Field(isString)
      label!: string;
    }
    sealClass(Inner);

    class Outer {
      @Field({ type: () => Inner })
      child!: Inner;
    }
    const outerBaker = sealClass(Outer);

    const result = (await outerBaker.deserialize<Outer>(Outer, { child: { label: 'hello' } })) as Outer;
    expect(result.child).toBeInstanceOf(Inner);
    expect(result.child.label).toBe('hello');
  });
});
