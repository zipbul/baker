import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { isNumber, isString } from '../rules/index';
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

  it('nested DTOs are cached too — a root cache-hit transitively reuses cached nested executors', () => {
    const fp = configFingerprint({});
    const a = new Baker();
    class Inner {
      @Field(isNumber()) k!: number;
    }
    @a.Recipe
    class Outer {
      @Field({ type: () => Inner }) inner!: Inner;
    }
    a.seal();

    const cachedOuter = getCached(Outer, fp);
    const cachedInner = getCached(Inner, fp);
    expect(cachedOuter).toBeDefined();
    expect(cachedInner).toBeDefined(); // nested sealed into the same cache under the same fingerprint

    const b = new Baker();
    (b.Recipe as (v: Function) => void)(Outer);
    b.seal();

    // root is a hit (entry unchanged) and the nested executor is the same shared object
    expect(getCached(Outer, fp)).toBe(cachedOuter!);
    expect(getCached(Inner, fp)).toBe(cachedInner!);
  });

  it('circular graph caches fully back-patched executors (not throwing placeholders)', () => {
    const fp = configFingerprint({});
    const a = new Baker();
    @a.Recipe
    class Node {
      @Field(isString) id!: string;
      @Field({ type: () => Node }) next?: Node; // self-reference → circular seal
    }
    a.seal();

    // A bare circularPlaceholder has no `merged`; a fully sealed executor does. Cached entry must be the
    // back-patched one, never a placeholder that throws "circular dependency during seal".
    expect(getCached(Node, fp)?.merged).toBeDefined();
  });

  it('a failed seal does not pollute the cache (commit is post-success)', () => {
    const fp = configFingerprint({});
    const x = new Baker();
    @x.Recipe
    class GoodOne {
      @Field(isNumber()) n!: number;
    }
    @x.Recipe
    class BadOne {
      @Field({
        type: () => {
          throw new Error('boom');
        },
      })
      bad!: unknown;
    }

    void BadOne; // registered via @x.Recipe; bound only to be sealed (and to fail the seal)
    expect(() => x.seal()).toThrow();
    // GoodOne compiles before BadOne throws, but setCached runs only after the whole seal succeeds.
    expect(getCached(GoodOne, fp)).toBeUndefined();
  });

  it('a cache-hit baker can resolve a nested-only DTO as a top-level argument (seeds the map)', () => {
    class Leaf {
      @Field(isNumber()) k!: number;
    }
    class Root {
      @Field({ type: () => Leaf }) leaf!: Leaf;
    }

    // First baker compiles fresh — recursion seeds Leaf into its map.
    const a = new Baker();
    (a.Recipe as (v: Function) => void)(Root);
    a.seal();
    expect((a.deserialize(Leaf, { k: 1 }) as Leaf).k).toBe(1);

    // Second baker (same config) HITS the Root cache entry. It must still resolve Leaf — the cache-hit
    // path seeds the transitive nested classes into b's map. (Regression guard: this used to throw.)
    const b = new Baker();
    (b.Recipe as (v: Function) => void)(Root);
    b.seal();
    expect((b.deserialize(Leaf, { k: 2 }) as Leaf).k).toBe(2);
    expect((b.deserialize(Root, { leaf: { k: 3 } }) as Root).leaf.k).toBe(3);
  });
});
