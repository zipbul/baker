import { BakerError } from '../common';

/**
 * Load an optional peer dependency (luxon/moment), translating a "not installed" resolution failure
 * into a clear BakerError. Only ERR_MODULE_NOT_FOUND ("not installed") maps to the peer-dep hint; a
 * module that IS installed but throws during evaluation surfaces its real error, not a misleading
 * "install it" message. Shared by luxonTransformer/momentTransformer. Taking the loader as a thunk
 * (rather than a specifier) is what makes the failure branch testable: a spec can pass a loader that
 * imports a nonexistent package, which the callers' own 1:1 specs never can (their peers are
 * installed devDependencies).
 */
export async function loadPeerDependency<T>(load: () => Promise<T>, missingMsg: string): Promise<T> {
  try {
    return await load();
  } catch (e) {
    throw (e as { code?: string }).code === 'ERR_MODULE_NOT_FOUND' ? new BakerError(missingMsg, { cause: e }) : e;
  }
}
