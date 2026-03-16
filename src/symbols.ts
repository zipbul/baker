/**
 * 2 Symbols — zero external storage, zero global pollution
 * Uses Symbol.for: allows AOT code and runtime code to share the same Symbol via the global registry
 */

/** Tier 1 collection metadata (stored on Class by decorators) */
export const RAW = Symbol.for('baker:raw');

/** Tier 2 seal result (dual executor stored on Class by seal()) */
export const SEALED = Symbol.for('baker:sealed');

/** Class-level @Schema() metadata */
export const RAW_CLASS_SCHEMA = Symbol.for('baker:rawClassSchema');
