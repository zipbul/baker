import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import { Field, deserialize, serialize, SealError, seal } from '../../index';
import { isNumber } from '../../src/rules/index';
import { ensureMeta } from '../../src/collect';
import { unseal, purgePoisonClasses } from '../integration/helpers/unseal';

// ─────────────────────────────────────────────────────────────────────────────

describe('SealError', () => {
  beforeEach(() => seal());
  afterEach(() => { purgePoisonClasses(); unseal(); });

  it('seal(NoFieldDto) on class without @Field → SealError', () => {
    class NoFieldDto {}
    expect(() => seal(NoFieldDto)).toThrow(SealError);
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
    ensureMeta(ProtoDto, '__proto__');
    expect(() => seal(ProtoDto)).toThrow(SealError);
  });

  it('banned field name "constructor" throws SealError at seal', () => {
    class CtorDto {}
    ensureMeta(CtorDto, 'constructor');
    expect(() => seal(CtorDto)).toThrow(SealError);
  });

  it('serialize null → SealError', () => {
    expect(() => serialize(null as any)).toThrow(SealError);
  });

  it('serialize primitive → SealError', () => {
    expect(() => serialize(42 as any)).toThrow(SealError);
  });

  it('serialize undefined → SealError', () => {
    expect(() => serialize(undefined as any)).toThrow(SealError);
  });

  it('serialize Object.create(null) → SealError (no constructor)', () => {
    const obj = Object.create(null);
    obj.name = 'Alice';
    expect(() => serialize(obj)).toThrow(SealError);
  });

  it('@Field with rule factory not invoked → SealError with factory hint', () => {
    expect(() => {
      class BadFactoryDto {
        @Field(isNumber as any) v!: number;
      }
      seal(BadFactoryDto);
    }).toThrow(/is not a baker rule.*Did you forget to call/);
  });

  it('@Field with non-function (number) → SealError', () => {
    expect(() => {
      class BadArgDto {
        @Field(42 as any) v!: number;
      }
      seal(BadArgDto);
    }).toThrow(/expected a baker rule.*got number/);
  });

  it('@Field(null) → SealError', () => {
    expect(() => {
      class NullArgDto {
        @Field(null as any) v!: number;
      }
      seal(NullArgDto);
    }).toThrow(/got null/);
  });
});
