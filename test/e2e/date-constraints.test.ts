import { describe, it, expect, afterEach } from 'bun:test';
import { Field, deserialize, toJsonSchema, BakerValidationError } from '../../index';
import { isDate, minDate, maxDate } from '../../src/rules/index';
import { unseal } from '../integration/helpers/unseal';

afterEach(() => unseal());

// ─────────────────────────────────────────────────────────────────────────────

const MIN = new Date('2020-01-01T00:00:00.000Z');
const MAX = new Date('2025-12-31T23:59:59.999Z');

class DateRangeDto {
  @Field(isDate, minDate(MIN), maxDate(MAX))
  eventDate!: Date;
}

class DateOnlyMinDto {
  @Field(isDate, minDate(MIN))
  start!: Date;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@MinDate/@MaxDate', () => {
  it('범위 내 → 통과', async () => {
    const d = new Date('2023-06-15T00:00:00.000Z');
    const result = await deserialize<DateRangeDto>(DateRangeDto, { eventDate: d });
    expect(result.eventDate).toEqual(d);
  });

  it('경계값 정확히 포함 (inclusive)', async () => {
    const rMin = await deserialize<DateRangeDto>(DateRangeDto, { eventDate: MIN });
    expect(rMin.eventDate).toEqual(MIN);

    const rMax = await deserialize<DateRangeDto>(DateRangeDto, { eventDate: MAX });
    expect(rMax.eventDate).toEqual(MAX);
  });

  it('범위 이전 → 거부', async () => {
    await expect(
      deserialize(DateRangeDto, { eventDate: new Date('2019-12-31T23:59:59.999Z') }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('범위 이후 → 거부', async () => {
    await expect(
      deserialize(DateRangeDto, { eventDate: new Date('2026-01-01T00:00:00.000Z') }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('Date 타입 아닌 값 → isDate 에러', async () => {
    await expect(
      deserialize(DateRangeDto, { eventDate: '2023-01-01' }),
    ).rejects.toThrow(BakerValidationError);
  });

  it('MinDate만 사용', async () => {
    const future = new Date('2099-01-01T00:00:00.000Z');
    const result = await deserialize<DateOnlyMinDto>(DateOnlyMinDto, { start: future });
    expect(result.start).toEqual(future);
  });

  it('toJsonSchema — format: date-time 매핑', () => {
    const schema = toJsonSchema(DateRangeDto);
    expect(schema.properties!.eventDate!.format).toBe('date-time');
  });
});
