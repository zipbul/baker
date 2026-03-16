/** minification-safe async function detection (uses Symbol.toStringTag, not constructor.name) */
export function isAsyncFunction(fn: Function): boolean {
  return (fn as unknown as Record<symbol, unknown>)[Symbol.toStringTag] === 'AsyncFunction';
}
