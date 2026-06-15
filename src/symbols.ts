/**
 * RAW symbol — zero external storage, zero global pollution.
 * Uses Symbol.for: allows AOT code and runtime code to share the same Symbol via the global registry.
 */

// TC39 decorator metadata polyfill. Bun 1.3.13 does not yet expose Symbol.metadata natively,
// so this defines it; the `??=` guard yields to a native value if a future runtime provides one.
// Must run before any decorated class is evaluated — symbols.ts sits at the root of the
// metadata import graph, so it always does.
(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata');

/** Tier 1 collection metadata (stored on Class[Symbol.metadata] by decorators) */
export const RAW: unique symbol = Symbol.for('baker:raw');
