import { describe, it, expect, afterEach } from 'bun:test';

import type { EmittableRule } from '../../src/rules/interfaces';

import { Baker, Field, BakerError } from '../../index';
import { isNumber, isString } from '../../src/rules/index';
import { applyField } from '../integration/helpers/modern-decorator';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

/** Test-only: cast arbitrary garbage into an EmittableRule slot to exercise @Field's runtime rejection. */
function asRule(v: unknown): EmittableRule {
  return v as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('BakerError', () => {
  const baker = new Baker();

  afterEach(() => unseal());

  it('sealClass(NoFieldDto) on a class without @Field seals to an empty executor (no error)', () => {
    class NoFieldDto {}
    expect(() => sealClass(NoFieldDto)).not.toThrow();
  });

  it('deserialize on class never sealed (no @Field) → BakerError', () => {
    class NoFieldDto2 {}
    expect(() => baker.deserialize(NoFieldDto2, { name: 'Alice' })).toThrow(BakerError);
  });

  it('serialize on class never sealed (no @Field) → BakerError', () => {
    class NoFieldDto3 {}
    const dto = new NoFieldDto3();
    expect(() => baker.serialize(dto)).toThrow(BakerError);
  });

  it('banned field name "__proto__" throws BakerError at seal', () => {
    class ProtoDto {}
    applyField(Field(isNumber()), ProtoDto, '__proto__');
    expect(() => sealClass(ProtoDto)).toThrow(BakerError);
  });

  it('banned field name "constructor" throws BakerError at seal', () => {
    class CtorDto {}
    applyField(Field(isNumber()), CtorDto, 'constructor');
    expect(() => sealClass(CtorDto)).toThrow(BakerError);
  });

  // A deserialized SUCCESS instance is distinguished from a raw BakerIssue[] failure via
  // Array.isArray. A DTO class extending Array would make a successful instance look like a
  // failure array, so it must be rejected at seal time — see `sealOne`'s Array-exotic guard.
  it('DTO class extending Array throws BakerError at seal', () => {
    class Bad extends Array {
      @Field(isString) x!: string;
    }
    expect(() => sealClass(Bad)).toThrow(
      'Bad: DTO classes must not extend Array — a deserialized instance would be indistinguishable from a validation-failure array.',
    );
  });

  it('DTO class extending Array throws BakerError at seal even with allowClassDefaults: true', () => {
    class BadWithDefaults extends Array {
      @Field(isString) x!: string;
    }
    const b = new Baker({ allowClassDefaults: true });
    (b.Recipe as (value: Function) => void)(BadWithDefaults);
    expect(() => b.seal()).toThrow(
      'BadWithDefaults: DTO classes must not extend Array — a deserialized instance would be indistinguishable from a validation-failure array.',
    );
  });

  it('a nested DTO extending Array (reached via type: () => BadNested) throws BakerError at seal', () => {
    class BadNested extends Array {
      @Field(isString) x!: string;
    }
    class Outer {
      @Field({ type: () => BadNested }) nested!: BadNested;
    }
    expect(() => sealClass(Outer)).toThrow(
      'BadNested: DTO classes must not extend Array — a deserialized instance would be indistinguishable from a validation-failure array.',
    );
  });

  it('a normal DTO (not extending Array) still seals fine', () => {
    class NormalDto {
      @Field(isString) x!: string;
    }
    expect(() => sealClass(NormalDto)).not.toThrow();
  });

  it('serialize null → BakerError', () => {
    expect(() => baker.serialize(null)).toThrow(BakerError);
  });

  it('serialize primitive → BakerError', () => {
    expect(() => baker.serialize(42)).toThrow(BakerError);
  });

  it('serialize undefined → BakerError', () => {
    expect(() => baker.serialize(undefined)).toThrow(BakerError);
  });

  it('serialize Object.create(null) → BakerError (no constructor)', () => {
    const obj = Object.create(null);
    obj.name = 'Alice';
    expect(() => baker.serialize(obj)).toThrow(BakerError);
  });

  it('@Field with rule factory not invoked → BakerError with factory hint', () => {
    expect(() => {
      class BadFactoryDto {
        @Field(asRule(isNumber)) v!: number;
      }
      sealClass(BadFactoryDto);
    }).toThrow(/is not a baker rule.*Did you forget to call/);
  });

  it('@Field with non-function (number) → BakerError', () => {
    expect(() => {
      class BadArgDto {
        @Field(asRule(42)) v!: number;
      }
      sealClass(BadArgDto);
    }).toThrow(/expected a baker rule.*got number/);
  });

  it('@Field(null) → BakerError', () => {
    expect(() => {
      class NullArgDto {
        @Field(asRule(null)) v!: number;
      }
      sealClass(NullArgDto);
    }).toThrow(/got null/);
  });
});
