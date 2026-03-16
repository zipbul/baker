/**
 * Global registry — automatically registers classes with at least one decorator attached
 *
 * - Automatically called from ensureMeta()
 * - seal() iterates this Set to seal all DTOs
 * - Metadata is not stored here — used only as an index (which classes are registered)
 */
export const globalRegistry = new Set<Function>();
