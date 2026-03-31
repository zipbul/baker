import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
import { isULID, isCUID2 } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

/** Helper: verify pass */
async function pass<T>(cls: new (...a: any[]) => T, input: unknown): Promise<T> {
  return deserialize<T>(cls, input) as Promise<T>;
}

/** Helper: verify rejection + return error code */
async function failCode(cls: new (...args: any[]) => any, input: unknown): Promise<string> {
  const result = await deserialize(cls, input);
  if (!isBakerError(result)) throw new Error('expected validation failure');
  return result.errors[0]!.code;
}

// ─── isULID ─────────────────────────────────────────────────────────────────

describe('isULID', () => {
  class Dto { @Field(isULID()) v!: string; }

  it('valid ULID passes', async () => {
    expect((await pass(Dto, { v: '01ARZ3NDEKTSV4RRFFQ69G5FAV' })).v).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  it('lowercase rejected', async () => {
    expect(await failCode(Dto, { v: '01arz3ndektsv4rrffq69g5fav' })).toBe('isULID');
  });

  it('wrong length rejected', async () => {
    expect(await failCode(Dto, { v: '01ARZ3NDEKTSV4RRFFQ69G5' })).toBe('isULID');
  });

  it('invalid chars I/L/O/U rejected', async () => {
    expect(await failCode(Dto, { v: '01ARZ3NDIKTSV4RRFFQ69G5FAV' })).toBe('isULID');
    expect(await failCode(Dto, { v: '01ARZ3NDLKTSV4RRFFQ69G5FAV' })).toBe('isULID');
    expect(await failCode(Dto, { v: '01ARZ3NDOKTSV4RRFFQ69G5FAV' })).toBe('isULID');
    expect(await failCode(Dto, { v: '01ARZ3NDUKTSV4RRFFQ69G5FAV' })).toBe('isULID');
  });

  it('non-string rejected', async () => {
    expect(await failCode(Dto, { v: 12345 })).toBe('isULID');
  });

  it('works as @Field rule in deserialize', async () => {
    class UlidDto { @Field(isULID()) id!: string; }
    const ok = await pass(UlidDto, { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' });
    expect(ok.id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');

    const err = await deserialize(UlidDto, { id: 'not-a-ulid' });
    expect(isBakerError(err)).toBe(true);
  });
});

// ─── isCUID2 ────────────────────────────────────────────────────────────────

describe('isCUID2', () => {
  class Dto { @Field(isCUID2()) v!: string; }

  it('valid CUID2 passes', async () => {
    expect((await pass(Dto, { v: 'clh3am6660002q2bfx5y9z0rn' })).v).toBe('clh3am6660002q2bfx5y9z0rn');
  });

  it('starts with number rejected', async () => {
    expect(await failCode(Dto, { v: '1lh3am6660002q2bfx5y9z0rn' })).toBe('isCUID2');
  });

  it('too short rejected', async () => {
    expect(await failCode(Dto, { v: 'clh3am' })).toBe('isCUID2');
  });

  it('uppercase rejected', async () => {
    expect(await failCode(Dto, { v: 'CLH3AM6660002Q2BFX5Y9Z0RN' })).toBe('isCUID2');
  });

  it('non-string rejected', async () => {
    expect(await failCode(Dto, { v: 99999 })).toBe('isCUID2');
  });

  it('works as @Field rule in deserialize', async () => {
    class Cuid2Dto { @Field(isCUID2()) id!: string; }
    const ok = await pass(Cuid2Dto, { id: 'clh3am6660002q2bfx5y9z0rn' });
    expect(ok.id).toBe('clh3am6660002q2bfx5y9z0rn');

    const err = await deserialize(Cuid2Dto, { id: 'NOT-VALID' });
    expect(isBakerError(err)).toBe(true);
  });
});
