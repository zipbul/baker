import { afterEach, describe, expect, it } from 'bun:test';

import { BakerError, createBaker, deserialize, Field, isBakerIssueSet, Recipe, seal } from '../../index';
import { min } from '../../src/rules/number';
import { isNumber, isString } from '../../src/rules/typechecker';
import { unseal } from '../integration/helpers/unseal';

// Each test defines its DTO classes locally so the global SEALED marker (stored on the class)
// is fresh per test — no cross-test leakage. The default instance is reset via unseal().
afterEach(() => unseal());

describe('createBaker — multi-app isolation', () => {
  it('seals and deserializes a class registered to an instance, without calling global seal()', () => {
    const app = createBaker();

    @app.Recipe
    class UserDto {
      @Field(isString) name!: string;
    }

    app.seal();

    const result = deserialize(UserDto, { name: 'Alice' });
    expect(isBakerIssueSet(result)).toBe(false);
    expect((result as UserDto).name).toBe('Alice');
  });

  it('does not seal another instance\'s class — each app seals only its own roots', () => {
    const appA = createBaker();
    const appB = createBaker();

    @appA.Recipe
    class A_Dto {
      @Field(isString) a!: string;
    }
    @appB.Recipe
    class B_Dto {
      @Field(isString) b!: string;
    }

    appA.seal(); // only A's roots

    expect(isBakerIssueSet(deserialize(A_Dto, { a: 'x' }))).toBe(false);
    expect(() => deserialize(B_Dto, { b: 'y' })).toThrow(BakerError); // B never sealed
  });

  it('isolates config per instance — same field shape, different autoConvert', () => {
    const lenient = createBaker({ autoConvert: true });
    const strict = createBaker({ autoConvert: false });

    @lenient.Recipe
    class LenientDto {
      @Field(isNumber(), min(0)) age!: number;
    }
    @strict.Recipe
    class StrictDto {
      @Field(isNumber(), min(0)) age!: number;
    }

    lenient.seal();
    strict.seal();

    const lenientResult = deserialize(LenientDto, { age: '123' });
    const strictResult = deserialize(StrictDto, { age: '123' });

    expect(isBakerIssueSet(lenientResult)).toBe(false);
    expect((lenientResult as LenientDto).age).toBe(123); // coerced
    expect(isBakerIssueSet(strictResult)).toBe(true); // "123" string rejected
  });

  it('shares a class sealed by another scope — reused (first seal wins), no throw', () => {
    const appA = createBaker({ autoConvert: true });
    const appB = createBaker({ autoConvert: false });

    @appA.Recipe
    @appB.Recipe
    class SharedDto {
      @Field(isNumber(), min(0)) age!: number;
    }

    appA.seal(); // seals SharedDto with autoConvert
    expect(() => appB.seal()).not.toThrow(); // shared class is reused, not re-sealed

    // One class = one sealed behavior (first seal wins): "123" is coerced.
    const result = deserialize(SharedDto, { age: '123' });
    expect(isBakerIssueSet(result)).toBe(false);
    expect((result as SharedDto).age).toBe(123);
  });

  it('reuses a shared nested DTO across scopes without bricking the second scope', () => {
    const appA = createBaker();
    const appB = createBaker();

    class AddressDto {
      @Field(isString) city!: string;
    }
    @appA.Recipe
    class RootA {
      @Field({ type: () => AddressDto }) addr!: AddressDto;
    }
    @appB.Recipe
    class RootB {
      @Field({ type: () => AddressDto }) addr!: AddressDto;
    }

    appA.seal(); // seals RootA + the shared AddressDto
    expect(() => appB.seal()).not.toThrow(); // RootB seals; AddressDto reused

    expect(isBakerIssueSet(deserialize(RootA, { addr: { city: 'x' } }))).toBe(false);
    expect(isBakerIssueSet(deserialize(RootB, { addr: { city: 'y' } }))).toBe(false);
  });

  it('app.seal() is idempotent — a second call is a no-op', () => {
    const app = createBaker();

    @app.Recipe
    class IdemDto {
      @Field(isString) x!: string;
    }

    app.seal();
    expect(() => app.seal()).not.toThrow();
    expect(isBakerIssueSet(deserialize(IdemDto, { x: 'a' }))).toBe(false);
  });

  it('createBaker rejects an unknown config key', () => {
    expect(() => createBaker({ bogus: true } as never)).toThrow(BakerError);
  });
});

describe('default global API — unchanged (regression)', () => {
  it('still seals and deserializes via global @Recipe + argless seal()', () => {
    @Recipe
    class GlobalDto {
      @Field(isString) name!: string;
    }

    seal();

    const result = deserialize(GlobalDto, { name: 'Bob' });
    expect(isBakerIssueSet(result)).toBe(false);
    expect((result as GlobalDto).name).toBe('Bob');
  });
});
