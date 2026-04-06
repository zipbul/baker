/** minification-safe async function detection (uses Symbol.toStringTag, not constructor.name) */
export function isAsyncFunction(fn: Function): boolean {
  return (fn as unknown as Record<symbol, unknown>)[Symbol.toStringTag] === 'AsyncFunction';
}

/** Promise-like detection used to enforce sync/async contract at runtime */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
