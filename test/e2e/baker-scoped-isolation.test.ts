import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { isNumber } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

// Per-app CONFIG isolation: the same class sealed by two bakers behaves per each baker's config.
// This is impossible under the global Class[SEALED] / first-seal-wins model; it is the headline of 5.1.

describe('Baker-scoped runtime — per-app config isolation', () => {
  it('same class, different autoConvert per baker — each baker.deserialize uses ITS own config', () => {
    const strict = new Baker({ autoConvert: false });
    const loose = new Baker({ autoConvert: true });

    @strict.Recipe
    @loose.Recipe
    class FlexDto {
      @Field(isNumber()) n!: number;
    }

    strict.seal();
    loose.seal();

    // strict: string "42" is not a number → issue
    assertBakerIssueSet(strict.deserialize(FlexDto, { n: '42' }));

    // loose: string "42" is coerced → ok, n === 42
    const rLoose = loose.deserialize(FlexDto, { n: '42' }) as FlexDto;
    expect(rLoose).toBeInstanceOf(FlexDto);
    expect(rLoose.n).toBe(42);
  });

  it('seal order does not matter — neither baker overrides the other (no shared-state coupling)', () => {
    const loose = new Baker({ autoConvert: true });
    const strict = new Baker({ autoConvert: false });

    @strict.Recipe
    @loose.Recipe
    class OrderDto {
      @Field(isNumber()) v!: number;
    }

    loose.seal(); // loose first this time
    strict.seal();

    expect((loose.deserialize(OrderDto, { v: '7' }) as OrderDto).v).toBe(7);
    assertBakerIssueSet(strict.deserialize(OrderDto, { v: '7' }));
  });

  it('transitive nested DTO behaves per each baker config (codegen resolver isolation)', () => {
    const strict = new Baker({ autoConvert: false });
    const loose = new Baker({ autoConvert: true });

    class Inner {
      @Field(isNumber()) k!: number;
    }
    @strict.Recipe
    @loose.Recipe
    class Outer {
      @Field({ type: () => Inner }) inner!: Inner;
    }

    strict.seal();
    loose.seal();

    assertBakerIssueSet(strict.deserialize(Outer, { inner: { k: '5' } }));
    const ok = loose.deserialize(Outer, { inner: { k: '5' } }) as Outer;
    expect(ok.inner.k).toBe(5);
  });

  it('deserialize on a class not sealed by this baker throws', () => {
    class NotMine {
      @Field(isNumber()) n!: number;
    }
    const app = new Baker();
    app.seal();
    expect(() => app.deserialize(NotMine, { n: 1 })).toThrow();
  });
});
