/** minification-safe async function detection (uses Symbol.toStringTag, not constructor.name) */
export function isAsyncFunction(fn: Function): boolean {
  return fn[Symbol.toStringTag] === 'AsyncFunction';
}
