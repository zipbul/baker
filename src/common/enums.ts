// Cross-cutting enums with no single owning stage (string-valued).

/** Direction of a (de)serialization pass. */
export enum Direction {
  Deserialize = 'deserialize',
  Serialize = 'serialize',
}

/** Cached accessor a RulePlan reuses across checks. */
export enum CacheKey {
  Length = 'length',
  Time = 'time',
}
