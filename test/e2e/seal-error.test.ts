import { describe, it, expect, afterEach } from 'bun:test';

import type { EmittableRule } from '../../src/types';

import { Field, deserialize, serialize, BakerError } from '../../index';
import { isNumber } from '../../src/rules/index';
import { applyField } from '../integration/helpers/modern-decorator';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

/** Test-only: cast arbitrary garbage into an EmittableRule slot to exercise @Field's runtime rejection. */
function asRule(v: unknown): EmittableRule {
  return v as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('BakerError', () => {
  afterEach(() => unseal());

  it('sealClass(NoFieldDto) on a class without @Field seals to an empty executor (no error)', () => {
    class NoFieldDto {}
    expect(() => sealClass(NoFieldDto)).not.toThrow();
  });

  it('deserialize on class never sealed (no @Field) → BakerError', () => {
    class NoFieldDto2 {}
    expect(() => deserialize(NoFieldDto2, { name: 'Alice' })).toThrow(BakerError);
  });

  it('serialize on class never sealed (no @Field) → BakerError', () => {
    class NoFieldDto3 {}
    const dto = new NoFieldDto3();
    expect(() => serialize(dto)).toThrow(BakerError);
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

  it('serialize null → BakerError', () => {
    expect(() => serialize(null)).toThrow(BakerError);
  });

  it('serialize primitive → BakerError', () => {
    expect(() => serialize(42)).toThrow(BakerError);
  });

  it('serialize undefined → BakerError', () => {
    expect(() => serialize(undefined)).toThrow(BakerError);
  });

  it('serialize Object.create(null) → BakerError (no constructor)', () => {
    const obj = Object.create(null);
    obj.name = 'Alice';
    expect(() => serialize(obj)).toThrow(BakerError);
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
