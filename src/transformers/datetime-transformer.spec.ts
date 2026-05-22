import { describe, it, expect } from 'bun:test';

import { luxonTransformer, momentTransformer } from './index';

// luxon and moment are installed as devDependencies so these happy paths execute the
// real DateTime/moment code. The missing-peer error branch cannot be co-tested here:
// in one bun process a module is either real or a throwing mock, not both.

describe('luxonTransformer — happy path', () => {
  it('deserialize parses an ISO string, serialize emits ISO', async () => {
    const t = await luxonTransformer();
    const dt = t.deserialize!({ value: '2021-06-15T00:00:00.000Z' } as never);
    expect(String(t.serialize!({ value: dt } as never))).toContain('2021-06-15T00:00:00.000');
  });

  it('deserialize accepts a Date', async () => {
    const t = await luxonTransformer();
    const dt = t.deserialize!({ value: new Date('2021-06-15T00:00:00.000Z') } as never);
    expect(String(t.serialize!({ value: dt } as never))).toContain('2021-06-15');
  });

  it('serialize honours a custom format', async () => {
    const t = await luxonTransformer({ format: 'yyyy/MM/dd' });
    const dt = t.deserialize!({ value: '2021-06-15T00:00:00.000Z' } as never);
    expect(t.serialize!({ value: dt } as never)).toBe('2021/06/15');
  });

  it('passes through non-date values untouched', async () => {
    const t = await luxonTransformer();
    expect(t.deserialize!({ value: 42 } as never)).toBe(42);
    expect(t.serialize!({ value: 42 } as never)).toBe(42);
  });
});

describe('momentTransformer — happy path', () => {
  it('deserialize parses a string, serialize emits ISO', async () => {
    const t = await momentTransformer();
    const m = t.deserialize!({ value: '2021-06-15T00:00:00.000Z' } as never);
    expect(t.serialize!({ value: m } as never)).toBe('2021-06-15T00:00:00.000Z');
  });

  it('deserialize accepts a Date', async () => {
    const t = await momentTransformer();
    const m = t.deserialize!({ value: new Date('2021-06-15T00:00:00.000Z') } as never);
    expect(t.serialize!({ value: m } as never)).toBe('2021-06-15T00:00:00.000Z');
  });

  it('serialize honours a custom format', async () => {
    const t = await momentTransformer({ format: 'YYYY/MM/DD' });
    const m = t.deserialize!({ value: '2021-06-15T00:00:00.000Z' } as never);
    expect(t.serialize!({ value: m } as never)).toBe('2021/06/15');
  });

  it('passes through non-date values untouched', async () => {
    const t = await momentTransformer();
    expect(t.deserialize!({ value: 42 } as never)).toBe(42);
    expect(t.serialize!({ value: 42 } as never)).toBe(42);
  });
});
