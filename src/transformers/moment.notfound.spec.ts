import { afterAll, describe, expect, it, mock } from 'bun:test';

import { BakerError } from '../common';
import { momentTransformer } from './moment';

// Forces `import('moment')` to fail with ERR_MODULE_NOT_FOUND (the missing-peer case) — moment is an
// installed devDependency, so a mock is the only way to execute this branch. Single call per file to
// avoid the dynamic-import module cache; mock.restore() in afterAll prevents leaking into sibling files.
describe('momentTransformer — peer dependency not installed', () => {
  afterAll(() => mock.restore());

  it('throws BakerError with the install hint', async () => {
    mock.module('moment', () => {
      const e = new Error('Cannot find package "moment"') as Error & { code?: string };
      e.code = 'ERR_MODULE_NOT_FOUND';
      throw e;
    });
    let caught: unknown;
    try {
      await momentTransformer();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BakerError);
    expect((caught as BakerError).message).toContain('bun add moment');
  });
});
