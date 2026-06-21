// ─────────────────────────────────────────────────────────────────────────────
// RuntimeOptions — per-call runtime options. Seam type: seal threads it through
// SealedExecutors' signature, runtime consumes it — neither stage owns it.
// ─────────────────────────────────────────────────────────────────────────────

export interface RuntimeOptions {
  /** Per-request groups — passed at runtime since they may vary per request */
  groups?: string[];
}
