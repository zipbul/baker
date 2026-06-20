import { describe, it, expect } from 'bun:test';

import { luxonTransformer } from './index';

// luxon is installed as a devDependency so this happy path executes the real DateTime code.
// The missing-peer error branch cannot be co-tested here: in one bun process a module is
// either real or a throwing mock, not both.

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
