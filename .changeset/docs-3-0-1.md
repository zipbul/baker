---
"@zipbul/baker": patch
---

Docs/metadata accuracy: every README example now includes the required `@Recipe` decorator
(without it `seal()` does not register the class and `deserialize` throws), drop the
unnecessary `() => Set as any` / `Map as any`, state the Bun-only requirement (Bun ≥ 1.3.13),
and replace unsubstantiated speed multipliers with honest qualitative claims. Refresh the
package description and remove the now-redundant MIGRATION-3.0.md (its content lives in the
CHANGELOG 3.0.0 entry).
