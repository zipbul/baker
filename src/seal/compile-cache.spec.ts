import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { isNumber } from '../rules/index';
import { getCached, configFingerprint } from './seal';

// The (class, config) cache: same-config bakers share one compiled executor; different-config
// bakers get distinct entries. Sharing is invisible behaviourally — verified via the cache itself.

describe('(class, config) executor cache', () => {
  it('two bakers with the SAME config reuse one cached executor (compile once)', () => {
    const fp = configFingerprint({ stopAtFirstError: true });

    const a = new Baker({ stopAtFirstError: true });
    @a.Recipe
    class C {
      @Field(isNumber()) n!: number;
    }
    a.seal();

    const first = getCached(C, fp);
    expect(first).toBeDefined();

    // A second baker with the same config must HIT the cache and NOT recompile/overwrite the entry.
    const b = new Baker({ stopAtFirstError: true });
    (b.Recipe as (v: Function) => void)(C);
    b.seal();

    expect(getCached(C, fp)).toBe(first!); // same object reference → b reused a's executor
  });

  it('different config → distinct cache entries (isolation preserved)', () => {
    const a = new Baker({ autoConvert: false });
    @a.Recipe
    class D {
      @Field(isNumber()) n!: number;
    }
    a.seal();

    const b = new Baker({ autoConvert: true });
    (b.Recipe as (v: Function) => void)(D);
    b.seal();

    // SealOptions key (BakerConfig's `autoConvert` normalizes to `enableImplicitConversion`)
    const fpStrict = configFingerprint({ enableImplicitConversion: false });
    const fpLoose = configFingerprint({ enableImplicitConversion: true });

    expect(fpStrict).not.toBe(fpLoose);
    expect(getCached(D, fpStrict)).toBeDefined();
    expect(getCached(D, fpLoose)).toBeDefined();
    expect(getCached(D, fpStrict)).not.toBe(getCached(D, fpLoose));
  });

  it('new Baker() and new Baker({}) share a fingerprint (all defaults → "00000")', () => {
    expect(configFingerprint({})).toBe('00000');
    expect(
      configFingerprint({
        enableImplicitConversion: false,
        exposeDefaultValues: false,
        stopAtFirstError: false,
        whitelist: false,
        debug: false,
      }),
    ).toBe('00000');
  });
});
