// ─────────────────────────────────────────────────────────────────────────────
// Shared code-generation utilities for deserialize/serialize builders
// ─────────────────────────────────────────────────────────────────────────────

/** Convert key to a valid JS identifier suffix (encode non-alphanumeric chars via charCode to prevent collisions) */
export function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, (ch) => `$${ch.charCodeAt(0)}$`);
}

/**
 * Generate a groups-has expression for the fast-path single-group / Set pattern.
 * Checks if any of the given groups match the runtime groups.
 */
export function buildGroupsHasExpr(singleGroupVar: string, groupsVar: string, groups: string[]): string {
  const checks = groups.map(group => {
    const q = JSON.stringify(group);
    return `(${singleGroupVar}===${q} || (${groupsVar} && ${groupsVar}.has(${q})))`;
  });
  return checks.join(' || ');
}
