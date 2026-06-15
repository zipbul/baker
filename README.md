# @zipbul/baker

The fastest decorator-based DTO validation library for TypeScript. baker generates optimized validation and serialization code once at seal time, then reuses the sealed executors on every call.

```bash
bun add @zipbul/baker
```

Zero `reflect-metadata`. Sealed codegen.

## Requirements

- **Bun ≥ 1.3.13.** baker relies on TC39 decorator metadata (`Symbol.metadata`), which Node does not populate — it is Bun-only.
- **ESM only.** baker ships no CommonJS build.
- **TypeScript ≥ 5.2** with native (TC39, Stage 3) decorators. Bun runs TypeScript directly, so your DTOs need no separate build step.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext", // must include Symbol.metadata (ES2022+/ESNext)
    "experimentalDecorators": false // use native TC39 decorators — this is the default; do NOT enable it
  }
}
```

## Quick Start

```typescript
import { Baker, Field, isBakerIssueSet } from '@zipbul/baker';
import { isString, isNumber, isEmail, min, minLength } from '@zipbul/baker/rules';

const baker = new Baker();

@baker.Recipe
class UserDto {
  @Field(isString, minLength(2)) name!: string;
  @Field(isNumber(), min(0)) age!: number;
  @Field(isString, isEmail()) email!: string;
}

// Call once at startup, after this baker's DTOs are defined.
baker.seal();

// All rules here are sync, so deserialize returns the value directly (no await).
const result = baker.deserialize(UserDto, {
  name: 'Alice',
  age: 30,
  email: 'alice@test.com',
});

if (isBakerIssueSet(result)) {
  // Reached only for invalid input, e.g. [{ path: 'email', code: 'isEmail' }]
  console.log(result.errors);
} else {
  console.log(result.name); // 'Alice' — typed as UserDto
}
```

`deserialize` returns either your typed instance or a `BakerIssueSet`; narrow between them with `isBakerIssueSet`. If any rule or transformer on the DTO is async, `deserialize` returns a `Promise` instead — `await` it (see [Runtime API](#runtime-api)).

## Core Concepts

| Concept | What it does |
| ------------------- | ------------------------------------------------------------------------------ |
| `new Baker(config?)` | An isolated registration + seal scope. Multiple bakers never mix. Use `@app.Recipe` and `app.seal()`. |
| `@app.Recipe`       | Marks a class as a DTO of that baker. Only `@Field` properties are part of the contract. |
| `@Field(...rules)`  | Declares a validated field. Global — works with any baker.                     |
| `app.seal()`        | Compiles that baker's DTOs into executor functions. Call once, at startup.     |
| `app.deserialize` / `app.validate` / `app.serialize` | Run that baker's compiled executors: parse+validate, validate-only, or emit a plain object. |

> Examples below assume a `const baker = new Baker()` in scope and a single `baker.seal()` after the DTOs are defined.

## Why baker?

baker generates optimized JavaScript functions once on first seal, then executes them on every call — no per-call rule interpretation.

| Feature            | baker                | class-validator        | Zod                 |
| ------------------ | -------------------- | ---------------------- | ------------------- |
| Approach           | AOT code generation  | Runtime interpretation | Schema method chain |
| Decorators         | `@Field` (unified)   | 30+ individual         | N/A                 |
| `reflect-metadata` | Not needed           | Required               | N/A                 |
| Sync DTO return    | Direct value         | Promise                | Direct value        |

## Performance

Benchmarked against multiple libraries on simple, nested, array, and error-collection scenarios. Exact numbers vary by machine and runtime — see [`bench/`](./bench) for the suite and to measure on your machine.

## @Field Decorator

One decorator for everything — replaces 30+ individual decorators from class-validator.

Only fields decorated with `@Field` participate in validation, deserialization, and serialization. Undecorated fields are silently absent from results — they are not part of the DTO contract.

```typescript
@Field(...rules)
@Field(...rules, options)
@Field(options)
@Field() // marker-only (no rules)
```

Each rule must be an emittable rule object created via `createRule()` or one of the built-in rule factories. Passing a raw function (e.g. `@Field(isNumber)` instead of `@Field(isNumber())`) throws `BakerError` at decorator-evaluation time.

### Options

Most fields need only rules. The options below cover nested, conditional, collection, and key-mapping cases — reach for them as needed.

| Option                      | Type                                              | Description                              |
| --------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `type`                      | `() => Dto \| [Dto] \| Set \| Map`                | Nested DTO. `[Dto]` for arrays; `Set`/`Map` for collections |
| `discriminator`             | `{ property, subTypes }`                          | Polymorphic dispatch (requires `type`)   |
| `keepDiscriminatorProperty` | `boolean`                                         | Keep the discriminator key in the result |
| `optional`                  | `boolean`                                         | Allow undefined                          |
| `nullable`                  | `boolean`                                         | Allow null                               |
| `name`                      | `string`                                          | Bidirectional key mapping                |
| `deserializeName`           | `string`                                          | Input key mapping                        |
| `serializeName`             | `string`                                          | Output key mapping                       |
| `exclude`                   | `boolean \| 'deserializeOnly' \| 'serializeOnly'` | Field exclusion                          |
| `groups`                    | `string[]`                                         | Conditional visibility                   |
| `when`                      | `(obj) => boolean`                                | Conditional validation                   |
| `transform`                 | `Transformer \| Transformer[]`                    | Value transformer                        |
| `message`                   | `string \| (args) => string`                      | Error message override                   |
| `context`                   | `unknown`                                          | Error context                            |
| `mapValue`                  | `() => Dto`                                        | Map value DTO                            |
| `setValue`                  | `() => Dto`                                        | Set element DTO                          |

### Conditional fields & custom messages

```typescript
@baker.Recipe
class UserDto {
  @Field(isString) name!: string;

  // Validated & exposed only when a matching group is requested at runtime.
  @Field(isString, { groups: ['admin'] }) ssn!: string;

  // Rules apply only when the predicate returns true for the input object.
  @Field(isString, isEmail(), { when: obj => obj.contactable === true })
  email!: string;

  // Override the default error message for this field's failures.
  @Field(isString, minLength(2), { message: 'Name must be at least 2 characters' })
  displayName!: string;
}

deserialize(UserDto, input); // `ssn` is skipped
deserialize(UserDto, input, { groups: ['admin'] }); // `ssn` is included
```

A field with no `groups` is always included; a field tagged with `groups` participates only when a matching group is passed via [runtime options](#runtime-options). See [`RuntimeOptions`](#runtime-options) for the call-site shape.

## Rules

114 built-in validation rules.

> **Constants vs factories:** rules listed without `()` are pre-built constants — use them bare (`@Field(isString)`). Rules shown with `()` are factories you must call (`@Field(isNumber())`). Passing a factory without calling it throws `BakerError`.

### Type Checkers

`isString`, `isInt`, `isBoolean`, `isDate`, `isArray`, `isObject` — constants, no `()` needed.

`isNumber(options?)`, `isEnum(entity)` — factories, require `()`.

### Numbers

`min(n)`, `max(n)`, `isPositive`, `isNegative`, `isDivisibleBy(n)`

### Strings

`minLength(n)`, `maxLength(n)`, `length(min, max)`, `contains(seed)`, `notContains(seed)`, `matches(regex)`

### Formats

`isEmail()`, `isURL()`, `isUUID(version?)`, `isIP(version?)`, `isISO8601()`, `isJSON`, `isJWT`, `isCreditCard`, `isIBAN()`, `isFQDN()`, `isMACAddress()`, `isBase64()`, `isHexColor`, `isSemVer`, `isMongoId`, `isPhoneNumber`, `isStrongPassword()`, `isULID()`, `isCUID2()`, `isHttpToken`

### Arrays

`arrayMinSize(n)`, `arrayMaxSize(n)`, `arrayUnique()`, `arrayNotEmpty`, `arrayContains(values)`, `arrayNotContains(values)`

> `arrayOf(...rules)` validates each element of an array against the given rules. It is imported from the main entry (`@zipbul/baker`), not `@zipbul/baker/rules`.

### Common

`equals(val)`, `notEquals(val)`, `isIn(values)`, `isNotIn(values)`, `isEmpty`, `isNotEmpty`

### Date

`minDate(date)`, `maxDate(date)`

### Locale

`isMobilePhone(locale)`, `isPostalCode(locale)`, `isIdentityCard(locale)`, `isPassportNumber(locale)`

## Transformers

Bidirectional value transformers with separate `deserialize` and `serialize` methods.

```typescript
import type { Transformer } from '@zipbul/baker';

const centsTransformer: Transformer = {
  deserialize: ({ value }) => (typeof value === 'number' ? value * 100 : value),
  serialize: ({ value }) => (typeof value === 'number' ? value / 100 : value),
};
```

### Built-in Transformers

```typescript
import {
  trimTransformer,
  toLowerCaseTransformer,
  toUpperCaseTransformer,
  roundTransformer,
  unixSecondsTransformer,
  unixMillisTransformer,
  isoStringTransformer,
  csvTransformer,
  jsonTransformer,
} from '@zipbul/baker/transformers';
```

| Transformer              | deserialize             | serialize               |
| ------------------------ | ----------------------- | ----------------------- |
| `trimTransformer`        | trim string             | trim string             |
| `toLowerCaseTransformer` | lowercase               | lowercase               |
| `toUpperCaseTransformer` | uppercase               | uppercase               |
| `roundTransformer(n?)`   | round to n decimals     | round to n decimals     |
| `unixSecondsTransformer` | unix seconds → Date     | Date → unix seconds     |
| `unixMillisTransformer`  | unix ms → Date          | Date → unix ms          |
| `isoStringTransformer`   | ISO string → Date       | Date → ISO string       |
| `csvTransformer(sep?)`   | `"a,b"` → `["a","b"]`   | `["a","b"]` → `"a,b"`   |
| `jsonTransformer`        | JSON string → object    | object → JSON string    |

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

`luxonTransformer` and `momentTransformer` require their respective libraries as optional peer dependencies — install whichever you use.

```typescript
// bun add luxon
import { luxonTransformer } from '@zipbul/baker/transformers';
const luxon = await luxonTransformer({ zone: 'Asia/Seoul' });

@baker.Recipe
class EventDto {
  @Field({ transform: luxon }) startAt!: DateTime;
}
```

```typescript
// bun add moment
import { momentTransformer } from '@zipbul/baker/transformers';
const mt = await momentTransformer({ format: 'YYYY-MM-DD' });
```

> **Note on `format`:** The `format` option in `luxonTransformer` / `momentTransformer` controls the **serialize-side output only**. On deserialize, both transformers parse the input with the library's default parser (ISO-first for Luxon, lenient parser for Moment). Using a lossy format like `'YYYY-MM-DD'` makes the transformer one-way — `serialize → deserialize` will not recover the original time of day. If you need a lossless roundtrip, omit `format` (defaults to ISO 8601).

## Composing DTOs

### Nested DTOs

```typescript
@baker.Recipe
class AddressDto {
  @Field(isString) city!: string;
}

@baker.Recipe
class UserDto {
  @Field({ type: () => AddressDto }) address!: AddressDto;
  @Field({ type: () => [AddressDto] }) addresses!: AddressDto[];
}
```

### Collections

```typescript
@baker.Recipe
class UserDto {
  @Field({ type: () => Set, setValue: () => TagDto }) tags!: Set<TagDto>;
  @Field({ type: () => Map, mapValue: () => PriceDto }) prices!: Map<string, PriceDto>;
}
```

> Deserialize input shape: a `Set` field accepts a JSON **array**, a `Map` field accepts a plain **object** keyed by string. Serialize emits the same shapes.

### Discriminator

```typescript
@baker.Recipe
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
  })
  pet!: CatDto | DogDto;
}
```

### Inheritance

```typescript
@baker.Recipe
class BaseDto {
  @Field(isString) id!: string;
}

@baker.Recipe
class UserDto extends BaseDto {
  @Field(isString) name!: string;
  // inherits 'id' field with isString rule
}
```

## Runtime API

### `new Baker(config?)`

A `Baker` is an isolated registration + seal scope. Construct one per app/library; multiple bakers in one process never mix.

- `@app.Recipe` — class decorator; registers the class as one of this baker's DTOs.
- `app.seal()` — **required.** Compiles the baker's DTOs (and any nested DTOs they reach) into executor functions. Call once at startup, after the baker's DTOs are defined. Idempotent.
- Config is passed to the constructor:

```typescript
const app = new Baker({
  autoConvert: true, // coerce "123" → 123
  allowClassDefaults: true, // use class field initializers for missing keys
  stopAtFirstError: true, // return on first validation failure
  forbidUnknown: true, // reject undeclared fields
});
```

`app.deserialize` / `app.serialize` / `app.validate` run that baker's compiled executors and throw `BakerError` if the class was not sealed by this baker.

**Isolation:** each baker compiles its own executor per class into its own map, so the **same class sealed by two bakers behaves per each baker's config** — apps never mix. (An undecorated subclass resolves to its nearest sealed ancestor within that baker.)

### `deserialize` / `serialize` / `validate`

Three entry points share the same sync/async shape. If the DTO has any async rule or transformer on the relevant side, the call returns a `Promise`; otherwise it returns the value directly.

| Function    | Signature                          | Returns (sync)          | Notes                                  |
| ----------- | ---------------------------------- | ----------------------- | -------------------------------------- |
| `deserialize` | `(Class, input, options?)`       | `T \| BakerIssueSet`    | Parse + validate. Never throws on validation failure. |
| `validate`    | `(Class, input, options?)`       | `true \| BakerIssueSet` | Validate only. |
| `serialize`   | `(instance, options?)`           | `Record<string, unknown>` | Emit a plain object. No validation. |

Async returns are wrapped: `Promise<T \| BakerIssueSet>`, `Promise<true \| BakerIssueSet>`, and `Promise<Record<string, unknown>>` respectively. The deserialize and serialize sides are independent — a DTO can be async on deserialize but sync on serialize, and vice versa.

To validate a single primitive without a DTO, call the rule directly: `isEmail()(value)`.

#### Strict variants

Each function has `*Sync` and `*Async` variants for unambiguous types:

- `deserializeSync` / `serializeSync` / `validateSync` — throw `BakerError` if the DTO is async on that side.
- `deserializeAsync` / `serializeAsync` / `validateAsync` — always return a `Promise` (sync DTOs are wrapped via `Promise.resolve`).

### Runtime options

`deserialize`, `serialize`, and `validate` accept an optional trailing `options` argument:

```typescript
interface RuntimeOptions {
  groups?: string[]; // per-request group selection — see @Field `groups`
}
```

Groups are passed at call time (not on `@Field`) because the active set typically varies per request.

### `createRule(name, validate)` / `createRule(options)`

Custom validation rule. Two forms — a `(name, validate)` shorthand or an options object:

```typescript
const koreanPhone = createRule('koreanPhone', v => /^01[016789]/.test(v as string));
```

```typescript
import { RequiredType } from '@zipbul/baker';

const isEven = createRule({
  name: 'isEven',
  validate: v => typeof v === 'number' && v % 2 === 0,
  requiresType: RequiredType.Number,
});
```

### `isBakerIssueSet(value)`

Type guard. Narrows a result to `BakerIssueSet`, whose `errors` array holds `{ path, code, message?, context? }` issues.

## Error Handling

baker separates two failure modes:

- **`BakerError` (thrown)** — a programming mistake: using a DTO before `app.seal()`, passing a raw rule function, an unknown config key, or calling a strict `*Sync` variant on an async DTO. Fix the code; don't catch it in request handlers.
- **`BakerIssueSet` (returned)** — a validation failure. `deserialize` and `validate` return it instead of throwing. Guard with `isBakerIssueSet` and read `.errors`.

```typescript
const result = baker.deserialize(UserDto, input);

if (isBakerIssueSet(result)) {
  for (const issue of result.errors) {
    console.log(`${issue.path}: ${issue.code}`); // e.g. "email: isEmail"
  }
} else {
  // result is a typed UserDto
}
```

## FAQ

### When should I use baker instead of class-validator?

When performance matters. baker generates optimized validation/serialization code at seal time instead of interpreting rules on every call, so it is substantially faster than class-validator on both valid and invalid input while providing the same decorator-based DX. baker also eliminates the `reflect-metadata` dependency. Run [`bench/`](./bench) to measure the exact difference on your machine.

### How does baker compare to Zod?

Zod uses schema method chains (`z.string().email()`), baker uses decorators (`@Field(isString, isEmail())`). baker generates optimized code at definition time instead of interpreting schemas at runtime. Choose Zod if you need schema-first design or Node support; choose baker if you need class-based DTOs on Bun with maximum performance.

### Does baker support async validation?

Yes. If any rule or transformer is async, baker automatically detects it at seal time and generates an async executor. Sync DTOs return values directly without Promise wrapping.

### Can I use baker with NestJS?

Yes. baker's `@Field` decorator works alongside NestJS pipes. Use `app.deserialize()` (your `Baker` instance) in a custom validation pipe.

### How does the AOT code generation work?

Calling `app.seal()` once at startup walks the baker's DTOs (and their nested DTOs), analyzes field metadata, generates optimized JavaScript executor functions, and stores them in that baker's map. Subsequent `app.deserialize` / `app.serialize` / `app.validate` calls run the pre-compiled functions directly. There is no auto-seal — using a DTO before `app.seal()` raises `BakerError`.

> baker builds its executors with `new Function()`. Under a strict Content-Security-Policy this requires `'unsafe-eval'`; baker will not run in environments that forbid runtime code generation.

## Exports

```typescript
import {
  Baker,
  deserialize, deserializeSync, deserializeAsync,
  validate, validateSync, validateAsync,
  serialize, serializeSync, serializeAsync,
  createRule, Field, arrayOf, isBakerIssueSet, BakerError, RequiredType, ExcludeMode,
} from '@zipbul/baker';
import type { Transformer, TransformParams, BakerIssue, BakerIssueSet, FieldOptions, EmittableRule, RuntimeOptions, BakerConfig } from '@zipbul/baker';
import { isString, isEmail, isULID, isCUID2 /* …114 rules */ } from '@zipbul/baker/rules';
import { trimTransformer, jsonTransformer /* …and more */ } from '@zipbul/baker/transformers';
```

Decorators are also available from the `@zipbul/baker/decorators` subpath.

## License

MIT
