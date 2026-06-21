import { describe, it, expect, beforeEach } from 'bun:test';

import { Baker, Field, isBakerIssueSet } from '../../index';
import { isDate, minDate, maxDate } from '../../src/rules/index';

const baker = new Baker();

beforeEach(() => baker.seal());

// ─────────────────────────────────────────────────────────────────────────────

const MIN = new Date('2020-01-01T00:00:00.000Z');
const MAX = new Date('2025-12-31T23:59:59.999Z');

@baker.Recipe
class DateRangeDto {
  @Field(isDate, minDate(MIN), maxDate(MAX))
  eventDate!: Date;
}

@baker.Recipe
class DateOnlyMinDto {
  @Field(isDate, minDate(MIN))
  start!: Date;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@MinDate/@MaxDate', () => {
  it('within range → passes', async () => {
    const d = new Date('2023-06-15T00:00:00.000Z');
    const result = (await baker.deserialize(DateRangeDto, { eventDate: d })) as DateRangeDto;
    expect(result.eventDate).toEqual(d);
  });

  it('boundary values are included (inclusive)', async () => {
    const rMin = (await baker.deserialize(DateRangeDto, { eventDate: MIN })) as DateRangeDto;
    expect(rMin.eventDate).toEqual(MIN);

    const rMax = (await baker.deserialize(DateRangeDto, { eventDate: MAX })) as DateRangeDto;
    expect(rMax.eventDate).toEqual(MAX);
  });

  it('before range → rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(DateRangeDto, { eventDate: new Date('2019-12-31T23:59:59.999Z') }))).toBe(
      true,
    );
  });

  it('after range → rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(DateRangeDto, { eventDate: new Date('2026-01-01T00:00:00.000Z') }))).toBe(
      true,
    );
  });

  it('non-Date value → isDate error', async () => {
    expect(isBakerIssueSet(await baker.deserialize(DateRangeDto, { eventDate: '2023-01-01' }))).toBe(true);
  });

  it('invalid Date object rejected', async () => {
    expect(isBakerIssueSet(await baker.deserialize(DateOnlyMinDto, { start: new Date('invalid') }))).toBe(true);
  });

  it('MinDate only', async () => {
    const future = new Date('2099-01-01T00:00:00.000Z');
    const result = (await baker.deserialize(DateOnlyMinDto, { start: future })) as DateOnlyMinDto;
    expect(result.start).toEqual(future);
  });
});
