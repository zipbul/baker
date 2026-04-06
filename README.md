# @zipbul/baker

The fastest decorator-based DTO validation library for TypeScript. Generates optimized validation and serialization code on first seal, then reuses the sealed executors on every call.

```bash
bun add @zipbul/baker
```

Zero `reflect-metadata`. Sealed codegen. 1,975 tests. 99%+ line coverage.

## Quick Start

```typescript
import { deserialize, isBakerError, Field } from '@zipbul/baker';
import { isString, isNumber, isEmail, min, minLength } from '@zipbul/baker/rules';

class UserDto {
  @Field(isString, minLength(2)) name!: string;
  @Field(isNumber(), min(0)) age!: number;
  @Field(isString, isEmail()) email!: string;
}

const result = await deserialize(UserDto, {
  name: 'Alice', age: 30, email: 'alice@test.com',
});

if (isBakerError(result)) {
  console.log(result.errors); // [{ path: 'email', code: 'isEmail' }]
} else {
  console.log(result.name);   // 'Alice' — typed as UserDto
}
```

## Why Baker?

Baker generates optimized JavaScript functions once on first seal, then executes them on every call.

| Feature | baker | class-validator | Zod |
|---|---|---|---|
| Valid path (5 fields) | **fast sealed path** | slower | slower |
| Invalid path (5 fields) | **fast sealed path** | slower | slower |
| Approach | AOT code generation | Runtime interpretation | Schema method chain |
| Decorators | `@Field` (unified) | 30+ individual | N/A |
| `reflect-metadata` | Not needed | Required | N/A |
| Sync DTO return | Direct value | Promise | Direct value |

## Performance

Benchmarked against multiple libraries on simple, nested, array, and error-collection scenarios. Exact numbers vary by machine and runtime.

See [`bench/`](./bench) for the current benchmark suite and exact scenarios.

## API

### `deserialize<T>(Class, input, options?)`

Returns `T | BakerErrors` for sync DTOs, `Promise<T | BakerErrors>` for async DTOs. Never throws on validation failure.

### `serialize<T>(instance, options?)`

Returns `Record<string, unknown>` for sync DTOs, `Promise<Record<string, unknown>>` for async DTOs. No validation.

### `validate(Class, input, options?)` / `validate(input, ...rules)`

DTO-level or ad-hoc single-value validation. Returns `true | BakerErrors` for sync paths, `Promise<true | BakerErrors>` for async paths.

### `isBakerError(value)`

Type guard. Narrows result to `BakerErrors` containing `{ path, code, message?, context? }[]`.

### `configure(config)`

Global configuration. Call before first deserialize/serialize/validate. Calling it after auto-seal throws `SealError`.

```typescript
configure({
  autoConvert: true,        // coerce "123" → 123
  allowClassDefaults: true, // use class field initializers for missing keys
  stopAtFirstError: true,   // return on first validation failure
  forbidUnknown: true,      // reject undeclared fields
});
```

### `createRule(name, validate)`

Custom validation rule.

```typescript
const isEven = createRule({
  name: 'isEven',
  validate: (v) => typeof v === 'number' && v % 2 === 0,
  requiresType: 'number',
});
```

## @Field Decorator

One decorator for everything — replaces 30+ individual decorators from class-validator.

```typescript
@Field(...rules)
@Field(...rules, options)
@Field(options)
```

### Options

| Option | Type | Description |
|---|---|---|
| `type` | `() => Dto \| [Dto]` | Nested DTO. `[Dto]` for arrays |
| `discriminator` | `{ property, subTypes }` | Polymorphic dispatch |
| `optional` | `boolean` | Allow undefined |
| `nullable` | `boolean` | Allow null |
| `name` | `string` | Bidirectional key mapping |
| `deserializeName` | `string` | Input key mapping |
| `serializeName` | `string` | Output key mapping |
| `exclude` | `boolean \| 'deserializeOnly' \| 'serializeOnly'` | Field exclusion |
| `groups` | `string[]` | Conditional visibility |
| `when` | `(obj) => boolean` | Conditional validation |
| `transform` | `Transformer \| Transformer[]` | Value transformer |
| `message` | `string \| (args) => string` | Error message override |
| `context` | `unknown` | Error context |
| `mapValue` | `() => Dto` | Map value DTO |
| `setValue` | `() => Dto` | Set element DTO |

## Transformers

Bidirectional value transformers with separate `deserialize` and `serialize` methods.

```typescript
import type { Transformer } from '@zipbul/baker';

const centsTransformer: Transformer = {
  deserialize: ({ value }) => typeof value === 'number' ? value * 100 : value,
  serialize: ({ value }) => typeof value === 'number' ? value / 100 : value,
};
```

### Built-in Transformers

```typescript
import {
  trimTransformer, toLowerCaseTransformer, toUpperCaseTransformer,
  roundTransformer, unixSecondsTransformer, unixMillisTransformer,
  isoStringTransformer, csvTransformer, jsonTransformer,
} from '@zipbul/baker/transformers';
```

| Transformer | deserialize | serialize |
|---|---|---|
| `trimTransformer` | trim string | trim string |
| `toLowerCaseTransformer` | lowercase | lowercase |
| `toUpperCaseTransformer` | uppercase | uppercase |
| `roundTransformer(n?)` | round to n decimals | round to n decimals |
| `unixSecondsTransformer` | unix seconds &rarr; Date | Date &rarr; unix seconds |
| `unixMillisTransformer` | unix ms &rarr; Date | Date &rarr; unix ms |
| `isoStringTransformer` | ISO string &rarr; Date | Date &rarr; ISO string |
| `csvTransformer(sep?)` | `"a,b"` &rarr; `["a","b"]` | `["a","b"]` &rarr; `"a,b"` |
| `jsonTransformer` | JSON string &rarr; object | object &rarr; JSON string |

### Transform Array Order

Multiple transformers apply as a codec stack:
- **Deserialize**: left to right — `[A, B, C]` applies A, then B, then C
- **Serialize**: right to left — `[A, B, C]` applies C, then B, then A

```typescript
@Field(isString, { transform: [trimTransformer, toLowerCaseTransformer] })
email!: string;
// deserialize "  HELLO  " → trim → toLowerCase → "hello"
// serialize   "hello"     → toLowerCase → trim → "hello"
```

### Optional Peer Transformers

```typescript
// bun add luxon
import { luxonTransformer } from '@zipbul/baker/transformers';
const luxon = await luxonTransformer({ zone: 'Asia/Seoul' });

class EventDto {
  @Field({ transform: luxon }) startAt!: DateTime;
}
```

```typescript
// bun add moment
import { momentTransformer } from '@zipbul/baker/transformers';
const mt = await momentTransformer({ format: 'YYYY-MM-DD' });
```

## Rules

104 built-in validation rules.

### Type Checkers

`isString`, `isInt`, `isBoolean`, `isDate`, `isArray`, `isObject` — constants, no `()` needed.

`isNumber(options?)`, `isEnum(entity)` — factories, require `()`.

### Numbers

`min(n)`, `max(n)`, `isPositive`, `isNegative`, `isDivisibleBy(n)`

### Strings

`minLength(n)`, `maxLength(n)`, `length(min, max)`, `contains(seed)`, `notContains(seed)`, `matches(regex)`

### Formats

`isEmail()`, `isURL()`, `isUUID(version?)`, `isIP(version?)`, `isISO8601()`, `isJSON`, `isJWT`, `isCreditCard`, `isIBAN()`, `isFQDN()`, `isMACAddress()`, `isBase64()`, `isHexColor`, `isSemVer`, `isMongoId`, `isPhoneNumber()`, `isStrongPassword()`, `isULID()`, `isCUID2()`

### Arrays

`arrayMinSize(n)`, `arrayMaxSize(n)`, `arrayUnique()`, `arrayNotEmpty`, `arrayContains(values)`, `arrayOf(...rules)`

### Common

`equals(val)`, `notEquals(val)`, `isIn(values)`, `isNotIn(values)`, `isEmpty`, `isNotEmpty`

### Date

`minDate(date)`, `maxDate(date)`

### Locale

`isMobilePhone(locale)`, `isPostalCode(locale)`, `isIdentityCard(locale)`, `isPassportNumber(locale)`

## Nested DTOs

```typescript
class AddressDto {
  @Field(isString) city!: string;
}

class UserDto {
  @Field({ type: () => AddressDto }) address!: AddressDto;
  @Field({ type: () => [AddressDto] }) addresses!: AddressDto[];
}
```

## Collections

```typescript
class UserDto {
  @Field({ type: () => Set as any, setValue: () => TagDto }) tags!: Set<TagDto>;
  @Field({ type: () => Map as any, mapValue: () => PriceDto }) prices!: Map<string, PriceDto>;
}
```

## Discriminator

```typescript
class PetOwner {
  @Field({
    type: () => CatDto,
    discriminator: {
      property: 'kind',
      subTypes: [
        { value: CatDto, name: 'cat' },
        { value: DogDto, name: 'dog' },
      ],
    },
  }) pet!: CatDto | DogDto;
}
```

## Inheritance

```typescript
class BaseDto {
  @Field(isString) id!: string;
}

class UserDto extends BaseDto {
  @Field(isString) name!: string;
  // inherits 'id' field with isString rule
}
```

## FAQ

### When should I use baker instead of class-validator?

When performance matters. baker is 163x faster on valid input and 109x faster on invalid input, while providing the same decorator-based DX. baker also eliminates the `reflect-metadata` dependency.

### How does baker compare to Zod?

Zod uses schema method chains (`z.string().email()`), baker uses decorators (`@Field(isString, isEmail())`). baker is 16x faster on valid input because it generates optimized code at definition time instead of interpreting schemas at runtime. Choose Zod if you need schema-first design; choose baker if you need class-based DTOs with maximum performance.

### Does baker support async validation?

Yes. If any rule or transformer is async, baker automatically detects it at seal time and generates an async executor. Sync DTOs return values directly without Promise wrapping.

### Can I use baker with NestJS?

Yes. baker's `@Field` decorator works alongside NestJS pipes. Use `deserialize()` in a custom validation pipe.

### How does the AOT code generation work?

On the first call to `deserialize`/`serialize`/`validate`, baker seals all registered DTOs: it analyzes field metadata, generates optimized JavaScript validation functions via `new Function()`, and caches them. Subsequent calls execute the pre-compiled functions directly.

## Exports

```typescript
import { deserialize, validate, serialize, configure, createRule, Field, arrayOf, isBakerError, SealError } from '@zipbul/baker';
import type { Transformer, TransformParams, BakerError, BakerErrors, FieldOptions, EmittableRule, RuntimeOptions } from '@zipbul/baker';
import { isString, isEmail, isULID, isCUID2, ... } from '@zipbul/baker/rules';
import { trimTransformer, jsonTransformer, ... } from '@zipbul/baker/transformers';
```

## License

MIT
