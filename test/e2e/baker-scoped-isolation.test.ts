import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { isNumber } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

// Per-app CONFIG isolation: the same class sealed by two bakers behaves per each baker's config.
// Each baker compiles its own executor into its own private map (keyed by class), so a class sealed
// by two bakers carries two independent behaviours; it is the headline of 5.1.

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

  it('validate is isolated too — same class, different autoConvert per baker', () => {
    const strict = new Baker({ autoConvert: false });
    const loose = new Baker({ autoConvert: true });

    @strict.Recipe
    @loose.Recipe
    class VDto {
      @Field(isNumber()) n!: number;
    }

    strict.seal();
    loose.seal();

    // strict rejects the string, loose accepts it (coercible) — validate goes through each baker's executor
    assertBakerIssueSet(strict.validate(VDto, { n: '42' }));
    expect(loose.validate(VDto, { n: '42' })).toBe(true);
  });

  it('serialize resolves through the owning baker (and a non-owner throws)', () => {
    const a = new Baker();
    const b = new Baker();

    @a.Recipe
    class SDto {
      @Field(isNumber()) n!: number;
    }

    a.seal();
    b.seal();

    const dto = Object.assign(new SDto(), { n: 7 });
    expect(a.serialize(dto)).toEqual({ n: 7 });
    // b never sealed SDto → its serialize map has no entry
    expect(() => b.serialize(dto)).toThrow();
  });

  it('discriminated-union subtypes are isolated per baker config', () => {
    const strict = new Baker({ autoConvert: false });
    const loose = new Baker({ autoConvert: true });

    class Dog {
      @Field(isNumber()) legs!: number;
    }
    class Cat {
      @Field(isNumber()) lives!: number;
    }
    @strict.Recipe
    @loose.Recipe
    class Owner {
      @Field({
        type: () => Dog,
        discriminator: {
          property: 'kind',
          subTypes: [
            { value: Dog, name: 'dog' },
            { value: Cat, name: 'cat' },
          ],
        },
      })
      pet!: Dog | Cat;
    }

    strict.seal();
    loose.seal();

    assertBakerIssueSet(strict.deserialize(Owner, { pet: { kind: 'dog', legs: '4' } }));
    const ok = loose.deserialize(Owner, { pet: { kind: 'dog', legs: '4' } }) as Owner;
    expect((ok.pet as Dog).legs).toBe(4);
  });

  it('Set value classes are isolated per baker config', () => {
    const strict = new Baker({ autoConvert: false });
    const loose = new Baker({ autoConvert: true });

    class Item {
      @Field(isNumber()) q!: number;
    }
    @strict.Recipe
    @loose.Recipe
    class Bag {
      @Field({ type: () => Set, setValue: () => Item })
      items!: Set<Item>;
    }

    strict.seal();
    loose.seal();

    assertBakerIssueSet(strict.deserialize(Bag, { items: [{ q: '5' }] }));
    const ok = loose.deserialize(Bag, { items: [{ q: '5' }] }) as Bag;
    expect([...ok.items][0]!.q).toBe(5);
  });

  it('deep (2-level) nesting is isolated per baker config', () => {
    const strict = new Baker({ autoConvert: false });
    const loose = new Baker({ autoConvert: true });

    class C {
      @Field(isNumber()) v!: number;
    }
    class B {
      @Field({ type: () => C }) c!: C;
    }
    @strict.Recipe
    @loose.Recipe
    class A {
      @Field({ type: () => B }) b!: B;
    }

    strict.seal();
    loose.seal();

    assertBakerIssueSet(strict.deserialize(A, { b: { c: { v: '9' } } }));
    const ok = loose.deserialize(A, { b: { c: { v: '9' } } }) as A;
    expect(ok.b.c.v).toBe(9);
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
