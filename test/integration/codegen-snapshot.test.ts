// Codegen byte-identity guard. Captures the SOURCE of each generated executor (deserialize / validate
// / serialize) for a representative DTO × config matrix into a committed snapshot. The structural
// refactors (Phases C/D) move codegen code verbatim, so these snapshots MUST NOT change — any diff is
// a codegen-drift regression (and, with the (class,config) cache sharing one sealed form across
// same-config bakers, drift is silently cross-baker-visible). Body text only — injected closure data
// (refs/regexes/execs) is not part of Function.prototype.toString().
import { describe, expect, it } from 'bun:test';

import type { BakerConfig } from '../../src/config';

import { Baker, Field, arrayOf } from '../../index';
import { configNormalizer } from '../../src/config';
import { CompileCache, compileCache } from '../../src/seal/compile-cache';
import {
  isBoolean,
  isEmail,
  isNumber,
  isString,
  min,
  minLength,
} from '../../src/rules/index';

const fpOf = (cfg?: BakerConfig): string => CompileCache.fingerprint(cfg ? configNormalizer.normalize(cfg) : {});

/** Seal `Dto` under `cfg`, then return the generated source of all three executors. */
function codegen(Dto: Function, cfg?: BakerConfig): { deserialize: string; validate: string; serialize: string } {
  const baker = new Baker(cfg);
  (baker.Recipe as (v: Function) => void)(Dto);
  baker.seal();
  const sealed = compileCache.get(Dto, fpOf(cfg));
  if (!sealed) {
    throw new Error('executor not cached');
  }
  return {
    deserialize: sealed.deserialize.toString(),
    validate: sealed.validate.toString(),
    serialize: sealed.serialize.toString(),
  };
}

// ── representative DTOs (distinct classes so cache keys never collide) ─────────

class SimpleDto {
  @Field(isString, minLength(2)) name!: string;
  @Field(isNumber(), min(0)) age!: number;
  @Field(isString, isEmail()) email!: string;
  @Field(isBoolean) active!: boolean;
}

class InnerDto {
  @Field(isNumber()) k!: number;
}
class NestedDto {
  @Field(isString) id!: string;
  @Field({ type: () => InnerDto }) inner!: InnerDto;
  @Field(arrayOf(isString)) tags!: string[];
}

class CollectionDto {
  @Field({ type: () => Set, setValue: () => InnerDto }) set!: Set<InnerDto>;
  @Field({ type: () => Map, mapValue: () => InnerDto }) map!: Map<string, InnerDto>;
}

const MATRIX: ReadonlyArray<readonly [string, Function]> = [
  ['Simple', SimpleDto],
  ['Nested', NestedDto],
  ['Collection', CollectionDto],
];

const CONFIGS: ReadonlyArray<readonly [string, BakerConfig | undefined]> = [
  ['default', undefined],
  ['autoConvert', { autoConvert: true }],
  ['stopAtFirstError', { stopAtFirstError: true }],
  ['forbidUnknown', { forbidUnknown: true }],
  ['allowClassDefaults', { allowClassDefaults: true }],
];

describe('codegen byte-identity snapshot', () => {
  for (const [cfgName, cfg] of CONFIGS) {
    for (const [dtoName, Dto] of MATRIX) {
      it(`${dtoName} @ ${cfgName}`, () => {
        expect(codegen(Dto, cfg)).toMatchSnapshot();
      });
    }
  }
});
