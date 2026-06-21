---
'@zipbul/baker': minor
---

Fix declared-collection element validation (RED tests added first), speed up collection `validate`, and
land an internal layering cleanup. One item changes observable behavior — review before upgrading:

- **Declared `@Type(() => Set)` / `@Type(() => Map)` now validate their elements (behavior change).** The
  declared-collection codegen path hand-rolled its per-element loop separately from the canonical
  (`type: null`) path and had three defects: a declared **Map** dropped every per-element `each` rule
  entirely; declared Set/Map `each` rules ignored the runtime `groups` filter; and a function `message` on
  an `each` rule received the whole collection as `value` instead of the failing element. All four sites
  (Set/Map × deserialize/validate) now route through one shared emitter with the same rule-major ordering,
  group filtering, per-element `value` binding, and `field[i]` paths as the canonical path. Input that was
  silently accepted because a Map's element rules never ran will now be validated.

- **Collection `validate` is ~4.7× faster on large arrays.** The inline-nested validate path eagerly
  allocated a per-element error-path string (`field[i].`) on every element even for valid input; it is now
  built only at the (cold) error-push sites. A 1000-element nested-DTO `validate` drops from ~10µs to
  ~2.2µs (now on par with TypeBox and ahead of Ajv). `deserialize` and all error paths are byte-identical.

- **`createRule` is now also exported from the `@zipbul/baker/rules` subpath** (it was already exported from
  the package root).

- **`luxonTransformer` / `momentTransformer` peer-dep error is now precise.** A genuinely-missing peer still
  throws the "install it" `BakerError`; a peer that IS installed but throws during evaluation now surfaces
  its real error instead of the misleading install hint.

Internal-only (no API change): the seal stage's TypeDef normalization was extracted out of the `sealOne`
god-function, large static lookup tables and the `string-format` validators were split into cohesive
modules, and several stateless helpers were simplified. Public surface is unchanged except the `createRule`
subpath export above (verified by an export-diff).
