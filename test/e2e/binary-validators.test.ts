import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { Baker, deserialize, isBakerIssueSet, Field } from '../../index';
import { isUint8Array, isByteSize } from '../../src/rules/index';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

const baker = new Baker();

beforeEach(() => baker.seal());
afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

@baker.Recipe
class TypeDto {
  @Field(isUint8Array)
  bytes!: Uint8Array;
}

@baker.Recipe
class SizeDto {
  @Field(isByteSize(16))
  view!: Uint8Array;
}

@baker.Recipe
class RangeDto {
  @Field(isByteSize(16, 32))
  view!: Uint8Array;
}

// The @zipbul/cookie kdfSalt shape — type guard + byte floor, optional.
@baker.Recipe
class SaltDto {
  @Field(isUint8Array, isByteSize(16), { optional: true })
  kdfSalt?: Uint8Array;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('isUint8Array (e2e)', () => {
  it('Uint8Array passes', async () => {
    const r = (await deserialize(TypeDto, { bytes: new Uint8Array([1, 2, 3]) })) as TypeDto;
    expect(r.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('plain array rejected', async () => {
    expect(isBakerIssueSet(await deserialize(TypeDto, { bytes: [1, 2, 3] }))).toBe(true);
  });

  it('string rejected', async () => {
    expect(isBakerIssueSet(await deserialize(TypeDto, { bytes: 'abc' }))).toBe(true);
  });

  it('Uint8ClampedArray rejected', async () => {
    expect(isBakerIssueSet(await deserialize(TypeDto, { bytes: new Uint8ClampedArray(3) }))).toBe(true);
  });
});

describe('isByteSize (e2e)', () => {
  it('16-byte Uint8Array passes', async () => {
    const r = (await deserialize(SizeDto, { view: new Uint8Array(16) })) as SizeDto;
    expect(r.view.byteLength).toBe(16);
  });

  it('15-byte Uint8Array rejected', async () => {
    expect(isBakerIssueSet(await deserialize(SizeDto, { view: new Uint8Array(15) }))).toBe(true);
  });

  // Guard short-circuit hazard: a non-view whose .byteLength satisfies the floor must still be
  // rejected. If the generated isView guard did NOT short-circuit, `99 >= 16` would wrongly pass.
  it('duck-typed object with a satisfying byteLength rejected (isView guard short-circuits)', async () => {
    expect(isBakerIssueSet(await deserialize(SizeDto, { view: { byteLength: 99 } as unknown as Uint8Array }))).toBe(true);
  });

  it('plain array of sufficient length rejected (not an ArrayBufferView)', async () => {
    const arr = Array.from({ length: 16 }, (_, i) => i) as unknown as Uint8Array;
    expect(isBakerIssueSet(await deserialize(SizeDto, { view: arr }))).toBe(true);
  });

  it('range: 32-byte at the upper bound passes through generated code', async () => {
    const r = (await deserialize(RangeDto, { view: new Uint8Array(32) })) as RangeDto;
    expect(r.view.byteLength).toBe(32);
  });

  it('range: 33-byte above max rejected through generated code', async () => {
    expect(isBakerIssueSet(await deserialize(RangeDto, { view: new Uint8Array(33) }))).toBe(true);
  });

  it('16-byte DataView passes (any ArrayBufferView counts)', async () => {
    @baker.Recipe
    class DataViewDto {
      @Field(isByteSize(16))
      view!: ArrayBufferView;
    }
    sealClass(DataViewDto);
    const dv = new DataView(new ArrayBuffer(16));
    const r = (await deserialize(DataViewDto, { view: dv })) as DataViewDto;
    expect(r.view.byteLength).toBe(16);
  });
});

describe('isUint8Array + isByteSize — cookie kdfSalt shape (e2e)', () => {
  it('valid 16-byte salt passes', async () => {
    const r = (await deserialize(SaltDto, { kdfSalt: new Uint8Array(16) })) as SaltDto;
    expect(r.kdfSalt?.byteLength).toBe(16);
  });

  it('absent salt passes (optional)', async () => {
    const r = (await deserialize(SaltDto, {})) as SaltDto;
    expect(r.kdfSalt).toBeUndefined();
  });

  it('8-byte salt rejected by byte floor', async () => {
    expect(isBakerIssueSet(await deserialize(SaltDto, { kdfSalt: new Uint8Array(8) }))).toBe(true);
  });

  it('DataView rejected by the isUint8Array guard even at sufficient size', async () => {
    const dv = new DataView(new ArrayBuffer(32));
    expect(isBakerIssueSet(await deserialize(SaltDto, { kdfSalt: dv as unknown as Uint8Array }))).toBe(true);
  });
});
