# Baker Roadmap

> Updated: 2026-03-17
> Target: @zipbul/baker 1.0.0+

---

## 1. Synchronous API — Complete

`deserialize()` / `serialize()` changed from `async function` to regular functions.
Sync DTOs return via `Promise.resolve()`, async DTOs return the executor's Promise directly.
Single API without separate `deserializeSync` / `serializeSync`.

## 2. Map/Set Auto Conversion — Complete

```typescript
// Set<primitive>: array ↔ Set
@Field({ type: () => Set })
tags: Set<string>;

// Set<DTO>: array of objects ↔ Set of DTO
@Field({ type: () => Set, setValue: () => TagDto })
tags: Set<TagDto>;

// Map<string, primitive>: plain object ↔ Map
@Field({ type: () => Map })
config: Map<string, unknown>;

// Map<string, DTO>: plain object of objects ↔ Map of DTO
@Field({ type: () => Map, mapValue: () => PriceDto })
prices: Map<string, PriceDto>;
```

JSON Schema: Set → `{ type: 'array', uniqueItems: true }`, Map → `{ type: 'object', additionalProperties: ... }`.

## 3. Custom Error Message Per-Field — Complete

```typescript
@Field(isString(), minLength(3), { message: 'Name is invalid' })
name: string;

@Field(isString(), {
  message: ({ property, value }) => `${property} received invalid value: ${value}`,
  context: { severity: 'error' },
})
name: string;
```
