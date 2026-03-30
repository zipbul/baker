import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, isBakerError } from '../../index';
import { isNumber, min, max } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

class ExclusiveDto {
  @Field(isNumber(), min(0, { exclusive: true }), max(100, { exclusive: true }))
  score!: number;
}

class InclusiveDto {
  @Field(isNumber(), min(0), max(100))
  value!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Min/@Max exclusive', () => {
  it('exclusive — boundary values exactly rejected', async () => {
    expect(isBakerError(await deserialize(ExclusiveDto, { score: 0 }))).toBe(true);
    expect(isBakerError(await deserialize(ExclusiveDto, { score: 100 }))).toBe(true);
  });

  it('exclusive — just inside boundary passes', async () => {
    const r1 = await deserialize(ExclusiveDto, { score: 0.001 }) as ExclusiveDto;
    expect(r1.score).toBe(0.001);
    const r2 = await deserialize(ExclusiveDto, { score: 99.999 }) as ExclusiveDto;
    expect(r2.score).toBe(99.999);
  });

  it('inclusive — boundary values included', async () => {
    const r1 = await deserialize(InclusiveDto, { value: 0 }) as InclusiveDto;
    expect(r1.value).toBe(0);
    const r2 = await deserialize(InclusiveDto, { value: 100 }) as InclusiveDto;
    expect(r2.value).toBe(100);
  });

  it('inclusive — out of range rejected', async () => {
    expect(isBakerError(await deserialize(InclusiveDto, { value: -1 }))).toBe(true);
    expect(isBakerError(await deserialize(InclusiveDto, { value: 101 }))).toBe(true);
  });
});

