import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import type { EmittableRule } from '../../src/types';

import { Field, Recipe, deserialize, serialize, SealError, seal } from '../../index';
import { isNumber } from '../../src/rules/index';
import { applyField } from '../integration/helpers/modern-decorator';
import { sealClass } from '../integration/helpers/seal';
import { unseal, purgePoisonClasses } from '../integration/helpers/unseal';

/** Test-only: cast arbitrary garbage into an EmittableRule slot to exercise @Field's runtime rejection. */
function asRule(v: unknown): EmittableRule {
  return v as EmittableRule;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SealError', () => {
  beforeEach(() => seal());
  afterEach(() => {
    purgePoisonClasses();
    unseal();
  });

  it('sealClass(NoFieldDto) on a class without @Field seals to an empty executor (no error)', () => {
    class NoFieldDto {}
    expect(() => sealClass(NoFieldDto)).not.toThrow();
  });

  it('deserialize on class never sealed (no @Field) → SealError', () => {
    class NoFieldDto2 {}
    expect(() => deserialize(NoFieldDto2, { name: 'Alice' })).toThrow(SealError);
  });

  it('serialize on class never sealed (no @Field) → SealError', () => {
    class NoFieldDto3 {}
    const dto = new NoFieldDto3();
    expect(() => serialize(dto)).toThrow(SealError);
  });

  it('banned field name "__proto__" throws SealError at seal', () => {
    class ProtoDto {}
    applyField(Field(isNumber()), ProtoDto, '__proto__');
    expect(() => sealClass(ProtoDto)).toThrow(SealError);
  });

  it('banned field name "constructor" throws SealError at seal', () => {
    class CtorDto {}
    applyField(Field(isNumber()), CtorDto, 'constructor');
    expect(() => sealClass(CtorDto)).toThrow(SealError);
  });

  it('serialize null → SealError', () => {
    expect(() => serialize(null)).toThrow(SealError);
  });

  it('serialize primitive → SealError', () => {
    expect(() => serialize(42)).toThrow(SealError);
  });

  it('serialize undefined → SealError', () => {
    expect(() => serialize(undefined)).toThrow(SealError);
  });

  it('serialize Object.create(null) → SealError (no constructor)', () => {
    const obj = Object.create(null);
    obj.name = 'Alice';
    expect(() => serialize(obj)).toThrow(SealError);
  });

  it('@Field with rule factory not invoked → SealError with factory hint', () => {
    expect(() => {
      @Recipe
      class BadFactoryDto {
        @Field(asRule(isNumber)) v!: number;
      }
      sealClass(BadFactoryDto);
    }).toThrow(/is not a baker rule.*Did you forget to call/);
  });

  it('@Field with non-function (number) → SealError', () => {
    expect(() => {
      @Recipe
      class BadArgDto {
        @Field(asRule(42)) v!: number;
      }
      sealClass(BadArgDto);
    }).toThrow(/expected a baker rule.*got number/);
  });

  it('@Field(null) → SealError', () => {
    expect(() => {
      @Recipe
      class NullArgDto {
        @Field(asRule(null)) v!: number;
      }
      sealClass(NullArgDto);
    }).toThrow(/got null/);
  });
});
