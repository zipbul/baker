# Baker 로드맵

> 갱신일: 2026-03-17
> 대상: @zipbul/baker 1.0.0+

---

## 1. Synchronous API — 완료

`deserialize()` / `serialize()`가 `async function` 대신 일반 함수로 변경됨.
sync DTO는 `Promise.resolve()`로 반환, async DTO는 executor의 Promise를 직접 반환.
별도 `deserializeSync` / `serializeSync` 없이 단일 API로 동작.

## 2. Map/Set 자동 변환 — 완료

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

## 3. Custom Error Message Per-Field — 완료

```typescript
@Field(isString(), minLength(3), { message: 'Name is invalid' })
name: string;

@Field(isString(), {
  message: ({ property, value }) => `${property} received invalid value: ${value}`,
  context: { severity: 'error' },
})
name: string;
```
