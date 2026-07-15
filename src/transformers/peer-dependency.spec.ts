import { describe, it, expect } from 'bun:test';

import { BakerError } from '../common';
import { loadPeerDependency } from './peer-dependency';

describe('loadPeerDependency', () => {
  it('should return the loaded module when the loader resolves', async () => {
    const loaded = await loadPeerDependency(() => import('luxon'), 'unused message');
    expect(typeof loaded.DateTime).toBe('function');
  });

  it('should translate a missing-module resolution failure into BakerError with the given message', async () => {
    // A real dynamic-import failure — the exact path the luxon/moment transformers hit when the
    // optional peer is not installed (code ERR_MODULE_NOT_FOUND).
    const missing = () => import('@zipbul/definitely-not-installed-peer' as string) as Promise<never>;
    const error = await loadPeerDependency(missing, 'Install the peer.').then(
      () => {
        throw new Error('expected loadPeerDependency to reject');
      },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BakerError);
    expect((error as BakerError).message).toBe('Install the peer.');
    expect((error as { cause?: { code?: string } }).cause?.code).toBe('ERR_MODULE_NOT_FOUND');
  });

  it('should rethrow a non-resolution error unchanged (installed module that throws on evaluation)', async () => {
    const evaluationError = new TypeError('boom during module evaluation');
    const throwing = () => Promise.reject(evaluationError);
    const error = await loadPeerDependency(throwing, 'unused message').then(
      () => {
        throw new Error('expected loadPeerDependency to reject');
      },
      (e: unknown) => e,
    );
    expect(error).toBe(evaluationError);
    expect(error).not.toBeInstanceOf(BakerError);
  });
});
