import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize } from '../../index';
import { isString } from '../../src/rules/index';
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

    class Outer {
      @Field({ type: () => Inner })
      child!: Inner;
    }

    const result = await deserialize<Outer>(Outer, { child: { label: 'hello' } });
    expect(result.child).toBeInstanceOf(Inner);
    expect(result.child.label).toBe('hello');
  });
});
