/** minification-safe async function detection — uses Object.prototype.toString brand instead of constructor.name */
export function isAsyncFunction(fn: (...args: never[]) => unknown): boolean {
  return Object.prototype.toString.call(fn) === '[object AsyncFunction]';
}

/** Promise-like detection used to enforce sync/async contract at runtime */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
