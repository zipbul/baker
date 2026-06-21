import { describe, it, expect } from 'bun:test';

import { unixSecondsTransformer, unixMillisTransformer, isoStringTransformer } from './date';

describe('unixSecondsTransformer', () => {
  it('deserialize converts a unix-seconds number to a Date', () => {
    const d = unixSecondsTransformer.deserialize!({ value: 1623715200 } as never) as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBe(1623715200 * 1000);
  });

  it('deserialize passes a non-number through untouched', () => {
    expect(unixSecondsTransformer.deserialize!({ value: 'x' } as never)).toBe('x');
  });

  it('deserialize passes a non-finite number (Infinity → Invalid Date) through untouched', () => {
    expect(unixSecondsTransformer.deserialize!({ value: Infinity } as never)).toBe(Infinity);
  });

  it('serialize converts a Date to unix seconds', () => {
    expect(unixSecondsTransformer.serialize!({ value: new Date(1623715200_000) } as never)).toBe(1623715200);
  });

  it('serialize passes a non-Date through untouched', () => {
    expect(unixSecondsTransformer.serialize!({ value: 42 } as never)).toBe(42);
  });
});

describe('unixMillisTransformer', () => {
  it('deserialize converts a unix-millis number to a Date', () => {
    const d = unixMillisTransformer.deserialize!({ value: 1623715200_000 } as never) as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBe(1623715200_000);
  });

  it('deserialize passes a non-number through untouched', () => {
    expect(unixMillisTransformer.deserialize!({ value: null } as never)).toBe(null);
  });

  it('deserialize passes a non-finite number through untouched', () => {
    expect(unixMillisTransformer.deserialize!({ value: NaN } as never)).toBeNaN();
  });

  it('serialize converts a Date to unix millis', () => {
    expect(unixMillisTransformer.serialize!({ value: new Date(1623715200_000) } as never)).toBe(1623715200_000);
  });

  it('serialize passes a non-Date through untouched', () => {
    expect(unixMillisTransformer.serialize!({ value: 'x' } as never)).toBe('x');
  });
});

describe('isoStringTransformer', () => {
  it('deserialize converts an ISO string to a Date', () => {
    const d = isoStringTransformer.deserialize!({ value: '2021-06-15T00:00:00.000Z' } as never) as Date;
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe('2021-06-15T00:00:00.000Z');
  });

  it('deserialize passes a non-string through untouched', () => {
    expect(isoStringTransformer.deserialize!({ value: 123 } as never)).toBe(123);
  });

  it('deserialize passes an unparseable string through untouched', () => {
    expect(isoStringTransformer.deserialize!({ value: 'not-a-date' } as never)).toBe('not-a-date');
  });

  it('serialize converts a Date to an ISO string', () => {
    expect(isoStringTransformer.serialize!({ value: new Date('2021-06-15T00:00:00.000Z') } as never)).toBe(
      '2021-06-15T00:00:00.000Z',
    );
  });

  it('serialize passes a non-Date through untouched', () => {
    expect(isoStringTransformer.serialize!({ value: 'x' } as never)).toBe('x');
  });
});
