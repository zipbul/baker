import { describe, it, expect, afterEach } from 'bun:test';
import { seal, deserialize, BakerValidationError, IsNumber, createRule } from '../../index';
import { collectValidation } from '../../src/collect';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

const isEven = createRule({
  name: 'isEven',
  validate: (v) => typeof v === 'number' && v % 2 === 0,
  constraints: { divisor: 2 },
  requiresType: 'number',
});

class EvenDto {
  @IsNumber()
  value!: number;
}
// 수동 데코레이터 등록 — createRule은 데코레이터 래퍼를 자동 생성하지 않음
collectValidation(EvenDto.prototype, 'value', { rule: isEven });

const asyncIsPositive = createRule({
  name: 'asyncPositive',
  validate: async (v) => typeof v === 'number' && v > 0,
});

class AsyncRuleDto {
  @IsNumber()
  score!: number;
}
collectValidation(AsyncRuleDto.prototype, 'score', { rule: asyncIsPositive });

// ─────────────────────────────────────────────────────────────────────────────

describe('createRule — sync', () => {
  it('규칙 통과', async () => {
    seal();
    const r = await deserialize<EvenDto>(EvenDto, { value: 4 });
    expect(r.value).toBe(4);
  });

  it('규칙 위반 → 커스텀 에러 코드', async () => {
    seal();
    try {
      await deserialize(EvenDto, { value: 3 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors.find(e => e.code === 'isEven');
      expect(err).toBeDefined();
    }
  });

  it('직접 호출 가능', () => {
    expect(isEven(4)).toBe(true);
    expect(isEven(3)).toBe(false);
  });
});

describe('createRule — async', () => {
  it('async 규칙 통과', async () => {
    seal();
    const r = await deserialize<AsyncRuleDto>(AsyncRuleDto, { score: 10 });
    expect(r.score).toBe(10);
  });

  it('async 규칙 위반', async () => {
    seal();
    try {
      await deserialize(AsyncRuleDto, { score: -1 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BakerValidationError);
      const err = (e as BakerValidationError).errors.find(e => e.code === 'asyncPositive');
      expect(err).toBeDefined();
    }
  });
});
