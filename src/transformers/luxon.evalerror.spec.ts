import { afterAll, describe, expect, it, mock } from 'bun:test';

import { BakerError } from '../common';
import { luxonTransformer } from './luxon';

// Forces `import('luxon')` to throw a NON-module-not-found error (installed but broken at eval) — the
// transformer must surface the real error, not the misleading "install it" hint. Single call per file.
describe('luxonTransformer — peer installed but throws during evaluation', () => {
  afterAll(() => mock.restore());

  it('rethrows the original error untouched (not a BakerError)', async () => {
    const boom = new Error('boom during module evaluation');
    mock.module('luxon', () => {
      throw boom;
    });
    let caught: unknown;
    try {
      await luxonTransformer();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(BakerError);
  });
});
