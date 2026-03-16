<p align="center">
  <h1 align="center">@zipbul/baker</h1>
  <p align="center">
    <strong>Decorator-based validate + transform with inline code generation</strong>
  </p>
  <p align="center">
    Single <code>@Field()</code> decorator &middot; AOT-level performance &middot; zero reflect-metadata
  </p>
  <p align="center">
    <a href="https://github.com/zipbul/baker/actions"><img src="https://github.com/zipbul/baker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/@zipbul/baker"><img src="https://img.shields.io/npm/v/@zipbul/baker.svg" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/@zipbul/baker"><img src="https://img.shields.io/npm/dm/@zipbul/baker.svg" alt="npm downloads"></a>
    <a href="https://github.com/zipbul/baker/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@zipbul/baker.svg" alt="license"></a>
  </p>
</p>

<p align="center">
  <a href="./README.ko.md">한국어</a>
</p>

---

## Why Baker?

| | class-validator | Zod | TypeBox | **Baker** |
|---|---|---|---|---|
| Schema style | Decorators | Function chaining | JSON Schema builder | **Single `@Field()` decorator** |
| Performance | Runtime interpreter | Runtime interpreter | JIT compile | **`new Function()` inline codegen** |
| Transform built-in | Separate package | `.transform()` | N/A | **Unified** |
| reflect-metadata | Required | N/A | N/A | **Not needed** |
| class-validator migration | — | Full rewrite | Full rewrite | **Near drop-in** |

Baker gives you a **single `@Field()` decorator** that combines validation, transformation, exposure control, and type hints. At first use, it auto-seals all DTOs by generating optimized functions via `new Function()` — delivering **AOT-equivalent performance without a compiler plugin**.

---

## Features

- **Single decorator** — `@Field()` replaces 30+ individual decorators
- **80+ built-in rules** — `isString`, `min()`, `isEmail()` and more, composed as arguments
- **Inline code generation** — auto-seal compiles validators at first `deserialize()`/`serialize()` call
- **Unified validate + transform** — `deserialize()` and `serialize()` in one async call
- **Zero reflect-metadata** — no `reflect-metadata` import needed
- **Circular reference detection** — automatic static analysis at seal time
- **Group-based validation** — apply different rules per request with `groups`
- **Custom rules** — `createRule()` for user-defined validators with codegen support
- **JSON Schema output** — `toJsonSchema()` generates JSON Schema Draft 2020-12 from your DTOs
- **Polymorphic discriminator** — `@Field({ discriminator })` for union types
- **Whitelist mode** — reject undeclared fields with `configure({ forbidUnknown: true })`
- **Class inheritance** — child DTOs inherit parent `@Field()` decorators automatically
- **Async transforms** — transform functions can be async

---

## Installation

```bash
bun add @zipbul/baker
```

> **Requirements:** Bun >= 1.0, `experimentalDecorators: true` in tsconfig.json

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

---

## Quick Start

### 1. Define a DTO

```typescript
import { Field } from '@zipbul/baker';
import { isString, isInt, isEmail, min, max } from '@zipbul/baker/rules';

class CreateUserDto {
  @Field(isString)
  name!: string;

  @Field(isInt, min(0), max(120))
  age!: number;

  @Field(isEmail())
  email!: string;
}
```

### 2. Deserialize (auto-seals on first call)

```typescript
import { deserialize, BakerValidationError } from '@zipbul/baker';

try {
  const user = await deserialize(CreateUserDto, requestBody);
  // user is a validated CreateUserDto instance
} catch (e) {
  if (e instanceof BakerValidationError) {
    console.log(e.errors); // BakerError[]
  }
}
```

### 3. Serialize

```typescript
import { serialize } from '@zipbul/baker';

const plain = await serialize(userInstance);
// plain: Record<string, unknown>
```

> No `seal()` call needed — baker auto-seals all registered DTOs on the first `deserialize()` or `serialize()` call.

---

## The `@Field()` Decorator

`@Field()` is the single decorator that replaces all individual decorators. It accepts validation rules as positional arguments and an options object for advanced features.

### Signatures

```typescript
// Rules only
@Field(isString, minLength(3), maxLength(100))

// Options only
@Field({ optional: true, nullable: true })

// Rules + options
@Field(isString, { name: 'user_name', groups: ['create'] })

// No rules (plain field)
@Field()
```

### FieldOptions

```typescript
interface FieldOptions {
  type?: () => Constructor | [Constructor];   // Nested DTO type (thunk for circular refs)
  discriminator?: {                           // Polymorphic union
    property: string;
    subTypes: { value: Function; name: string }[];
  };
  keepDiscriminatorProperty?: boolean;        // Keep discriminator key in output
  rules?: (EmittableRule | ArrayOfMarker)[];  // Validation rules (alternative to positional args)
  optional?: boolean;                         // Allow undefined
  nullable?: boolean;                         // Allow null
  name?: string;                              // JSON key mapping (bidirectional)
  deserializeName?: string;                   // Deserialize-only key mapping
  serializeName?: string;                     // Serialize-only key mapping
  exclude?: boolean | 'deserializeOnly' | 'serializeOnly';
  groups?: string[];                          // Visibility + conditional validation
  when?: (obj: any) => boolean;               // Conditional validation
  schema?: JsonSchemaOverride;                // JSON Schema metadata
  transform?: (params: FieldTransformParams) => unknown;
  transformDirection?: 'deserializeOnly' | 'serializeOnly';
}
```

### Per-rule Options (message, groups)

Per-rule options like `message`, `groups`, and `context` are **not** passed as arguments to individual rule functions. Instead, they are controlled at the `@Field()` level:

- **`groups`** — set via `FieldOptions.groups` (applies to all rules on that field)
- **`message`** / **`context`** — use `createRule()` for custom error messages, or handle via `BakerError.code`
- **`each` (array element validation)** — use `arrayOf()` (see below)

### `arrayOf()` — Array Element Validation

`arrayOf()` applies rules to each element of an array. Import it from `@zipbul/baker/rules` or `@zipbul/baker`.

```typescript
import { Field, arrayOf } from '@zipbul/baker';
import { isString, minLength } from '@zipbul/baker/rules';

class TagsDto {
  @Field(arrayOf(isString, minLength(1)))
  tags!: string[];
}
```

You can mix `arrayOf()` with top-level array rules:

```typescript
import { arrayMinSize, arrayMaxSize } from '@zipbul/baker/rules';

class ScoresDto {
  @Field(arrayMinSize(1), arrayMaxSize(10), arrayOf(isInt, min(0), max(100)))
  scores!: number[];
}
```

---

## Built-in Rules

All rules are imported from `@zipbul/baker/rules` and passed as arguments to `@Field()`.

> **Constants vs factory functions:** Some rules are pre-built constants (used without `()`) while others are factory functions that accept parameters (used with `()`). The tables below mark constants with a dagger symbol.

### Type Checkers

| Rule | Description |
|---|---|
| `isString` | `typeof === 'string'` |
| `isNumber(opts?)` | `typeof === 'number'` with NaN/Infinity/maxDecimalPlaces checks |
| `isInt` | Integer check |
| `isBoolean` | `typeof === 'boolean'` |
| `isDate` | `instanceof Date && !isNaN` |
| `isEnum(enumObj)` | Enum value check |
| `isArray` | `Array.isArray()` |
| `isObject` | `typeof === 'object'`, excludes null/Array |

> `isString`, `isInt`, `isBoolean`, `isDate`, `isArray`, `isObject` are constants (no parentheses needed). `isNumber(opts?)` and `isEnum(enumObj)` are factory functions.

### Common

| Rule | Description |
|---|---|
| `equals(val)` | Strict equality (`===`) |
| `notEquals(val)` | Strict inequality (`!==`) |
| `isEmpty` | `undefined`, `null`, or `''` |
| `isNotEmpty` | Not `undefined`, `null`, or `''` |
| `isIn(arr)` | Value is in the given array |
| `isNotIn(arr)` | Value is not in the given array |

> `isEmpty` and `isNotEmpty` are constants. The rest are factory functions.

### Number

| Rule | Description |
|---|---|
| `min(n, opts?)` | `value >= n` (supports `{ exclusive: true }`) |
| `max(n, opts?)` | `value <= n` (supports `{ exclusive: true }`) |
| `isPositive` | `value > 0` |
| `isNegative` | `value < 0` |
| `isDivisibleBy(n)` | `value % n === 0` |

> `isPositive` and `isNegative` are constants (no parentheses). `min()`, `max()`, and `isDivisibleBy()` are factory functions.

### String

All string rules require the value to be a `string` type.

| Rule | Kind | Description |
|---|---|---|
| `minLength(n)` | factory | Minimum length |
| `maxLength(n)` | factory | Maximum length |
| `length(min, max)` | factory | Length range |
| `contains(seed)` | factory | Contains substring |
| `notContains(seed)` | factory | Does not contain substring |
| `matches(pattern, modifiers?)` | factory | Regex match |
| `isLowercase` | constant | All lowercase |
| `isUppercase` | constant | All uppercase |
| `isAscii` | constant | ASCII only |
| `isAlpha` | constant | Alphabetic only (en-US) |
| `isAlphanumeric` | constant | Alphanumeric only (en-US) |
| `isBooleanString` | constant | `'true'`, `'false'`, `'1'`, or `'0'` |
| `isNumberString(opts?)` | factory | Numeric string |
| `isDecimal(opts?)` | factory | Decimal string |
| `isFullWidth` | constant | Full-width characters |
| `isHalfWidth` | constant | Half-width characters |
| `isVariableWidth` | constant | Mix of full-width and half-width |
| `isMultibyte` | constant | Multibyte characters |
| `isSurrogatePair` | constant | Surrogate pair characters |
| `isHexadecimal` | constant | Hexadecimal string |
| `isOctal` | constant | Octal string |
| `isEmail(opts?)` | factory | Email format |
| `isURL(opts?)` | factory | URL format (port range validated) |
| `isUUID(version?)` | factory | UUID v1-v5 |
| `isIP(version?)` | factory | IPv4 / IPv6 |
| `isHexColor` | constant | Hex color (`#fff`, `#ffffff`) |
| `isRgbColor(includePercent?)` | factory | RGB color string |
| `isHSL` | constant | HSL color string |
| `isMACAddress(opts?)` | factory | MAC address |
| `isISBN(version?)` | factory | ISBN-10 / ISBN-13 |
| `isISIN` | constant | ISIN (International Securities Identification Number) |
| `isISO8601(opts?)` | factory | ISO 8601 date string |
| `isISRC` | constant | ISRC (International Standard Recording Code) |
| `isISSN(opts?)` | factory | ISSN (International Standard Serial Number) |
| `isJWT` | constant | JSON Web Token |
| `isLatLong(opts?)` | factory | Latitude/longitude string |
| `isLocale` | constant | Locale string (e.g. `en_US`) |
| `isDataURI` | constant | Data URI |
| `isFQDN(opts?)` | factory | Fully qualified domain name |
| `isPort` | constant | Port number string (0-65535) |
| `isEAN` | constant | EAN (European Article Number) |
| `isISO31661Alpha2` | constant | ISO 3166-1 alpha-2 country code |
| `isISO31661Alpha3` | constant | ISO 3166-1 alpha-3 country code |
| `isBIC` | constant | BIC (Bank Identification Code) / SWIFT code |
| `isFirebasePushId` | constant | Firebase Push ID |
| `isSemVer` | constant | Semantic version string |
| `isMongoId` | constant | MongoDB ObjectId (24-char hex) |
| `isJSON` | constant | Parseable JSON string |
| `isBase32(opts?)` | factory | Base32 encoded |
| `isBase58` | constant | Base58 encoded |
| `isBase64(opts?)` | factory | Base64 encoded |
| `isDateString(opts?)` | factory | Date string (configurable strict mode) |
| `isMimeType` | constant | MIME type string |
| `isCurrency(opts?)` | factory | Currency string |
| `isMagnetURI` | constant | Magnet URI |
| `isCreditCard` | constant | Credit card number (Luhn) |
| `isIBAN(opts?)` | factory | IBAN |
| `isByteLength(min, max?)` | factory | Byte length range |
| `isHash(algorithm)` | factory | Hash string (md4, md5, sha1, sha256, sha384, sha512, etc.) |
| `isRFC3339` | constant | RFC 3339 date-time string |
| `isMilitaryTime` | constant | Military time (HH:MM) |
| `isLatitude` | constant | Latitude string |
| `isLongitude` | constant | Longitude string |
| `isEthereumAddress` | constant | Ethereum address |
| `isBtcAddress` | constant | Bitcoin address |
| `isISO4217CurrencyCode` | constant | ISO 4217 currency code |
| `isPhoneNumber` | constant | E.164 international phone number |
| `isStrongPassword(opts?)` | factory | Strong password (configurable min length, uppercase, lowercase, numbers, symbols) |
| `isTaxId(locale)` | factory | Tax ID for given locale |

### Array

| Rule | Description |
|---|---|
| `arrayContains(values)` | Contains all given elements |
| `arrayNotContains(values)` | Contains none of the given elements |
| `arrayMinSize(n)` | Minimum array length |
| `arrayMaxSize(n)` | Maximum array length |
| `arrayUnique()` | No duplicates |
| `arrayNotEmpty()` | Not empty |

### Date

| Rule | Description |
|---|---|
| `minDate(date)` | Minimum date |
| `maxDate(date)` | Maximum date |

### Object

| Rule | Description |
|---|---|
| `isNotEmptyObject(opts?)` | At least one key (supports `{ nullable: true }` to ignore null-valued keys) |
| `isInstance(Class)` | `instanceof` check against given class |

### Locale

Locale-specific validators that accept a locale string parameter.

| Rule | Description |
|---|---|
| `isMobilePhone(locale)` | Mobile phone number for the given locale (e.g. `'ko-KR'`, `'en-US'`, `'ja-JP'`) |
| `isPostalCode(locale)` | Postal code for the given locale/country code (e.g. `'US'`, `'KR'`, `'GB'`) |
| `isIdentityCard(locale)` | National identity card number for the given locale (e.g. `'KR'`, `'US'`, `'CN'`) |
| `isPassportNumber(locale)` | Passport number for the given locale (e.g. `'US'`, `'KR'`, `'GB'`) |

---

## Configuration

Call `configure()` **before** the first `deserialize()`/`serialize()`:

```typescript
import { configure } from '@zipbul/baker';

configure({
  autoConvert: false,        // Implicit type conversion ("123" -> 123)
  allowClassDefaults: false, // Use class default values for missing keys
  stopAtFirstError: false,   // Stop at first error or collect all
  forbidUnknown: false,      // Reject undeclared fields
  debug: false,              // Emit field exclusion comments in generated code
});
```

`configure()` returns `{ warnings: string[] }` — if called after auto-seal, warnings describe which classes won't be affected.

---

## Error Handling

When validation fails, `deserialize()` throws a `BakerValidationError`:

```typescript
class BakerValidationError extends Error {
  readonly errors: BakerError[];
  readonly className: string;
}

interface BakerError {
  readonly path: string;      // 'user.address.city'
  readonly code: string;      // 'isString', 'min', 'isEmail'
  readonly message?: string;  // Custom message
  readonly context?: unknown; // Custom context
}
```

---

## Nested Objects

Use `type` option for nested DTO validation:

```typescript
class AddressDto {
  @Field(isString)
  city!: string;
}

class UserDto {
  @Field({ type: () => AddressDto })
  address!: AddressDto;

  // Array of nested DTOs
  @Field({ type: () => [AddressDto] })
  addresses!: AddressDto[];
}
```

### Discriminator (Polymorphism)

```typescript
class DogDto {
  @Field(isString) breed!: string;
}
class CatDto {
  @Field(isBoolean) indoor!: boolean;
}

class PetOwnerDto {
  @Field({
    type: () => DogDto,
    discriminator: {
      property: 'type',
      subTypes: [
        { value: DogDto, name: 'dog' },
        { value: CatDto, name: 'cat' },
      ],
    },
  })
  pet!: DogDto | CatDto;
}
```

Discriminator works in both directions — `deserialize()` switches on the property value, `serialize()` dispatches via `instanceof`.

---

## Inheritance

Baker supports class inheritance. Child DTOs automatically inherit all `@Field()` decorators from parent classes. You can override or extend fields in child classes:

```typescript
class BaseDto {
  @Field(isString)
  name!: string;
}

class ExtendedDto extends BaseDto {
  @Field(isInt, min(0))
  age!: number;
  // `name` is inherited from BaseDto
}
```

---

## Transform

The `transform` option in `FieldOptions` lets you transform values during deserialization and/or serialization. Transform functions can be **async**.

```typescript
class UserDto {
  @Field(isString, {
    transform: ({ value, direction }) => {
      return direction === 'deserialize'
        ? (value as string).trim().toLowerCase()
        : value;
    },
  })
  email!: string;

  @Field(isString, {
    transform: async ({ value }) => {
      return await someAsyncOperation(value);
    },
    transformDirection: 'deserializeOnly',
  })
  data!: string;
}
```

---

## Custom Rules

```typescript
import { createRule } from '@zipbul/baker';

const isPositiveInt = createRule({
  name: 'isPositiveInt',
  validate: (value) => Number.isInteger(value) && (value as number) > 0,
});

class Dto {
  @Field(isPositiveInt)
  count!: number;
}
```

---

## Class-level JSON Schema Metadata

Use `collectClassSchema()` to attach class-level JSON Schema metadata (title, description, etc.) to a DTO. This metadata is merged into the output of `toJsonSchema()`.

> `collectClassSchema` is a low-level API exported from `src/collect.ts`. It is not available as a subpath export and must be imported directly.

```typescript
import { collectClassSchema } from '@zipbul/baker/src/collect';

class CreateUserDto {
  @Field(isString) name!: string;
  @Field(isEmail()) email!: string;
}

collectClassSchema(CreateUserDto, {
  title: 'CreateUserRequest',
  description: 'Payload for creating a new user',
});
```

For property-level schema overrides, use the `schema` option in `@Field()`:

```typescript
class Dto {
  @Field(isString, minLength(1), {
    schema: { description: 'User display name', minLength: 5 },
  })
  name!: string;
}
```

---

## JSON Schema

Generate JSON Schema Draft 2020-12 from your DTOs:

```typescript
import { toJsonSchema } from '@zipbul/baker';

const schema = toJsonSchema(CreateUserDto, {
  direction: 'deserialize',  // 'deserialize' | 'serialize'
  groups: ['create'],         // Filter by group
  onUnmappedRule: (name) => { /* custom rules without schema mapping */ },
});
```

---

## How It Works

```
Decorators (@Field)     auto-seal (first call)     deserialize() / serialize()
   metadata         ->   new Function() codegen  ->   execute generated code
```

1. `@Field()` attaches validation metadata to class properties at definition time
2. First `deserialize()`/`serialize()` call triggers **auto-seal** — reads all metadata, analyzes circular references, generates optimized JavaScript functions via `new Function()`
3. Subsequent calls execute the generated function directly — no interpretation loops

---

## Subpath Exports

| Import path | Purpose |
|---|---|
| `@zipbul/baker` | Main API: `deserialize`, `serialize`, `configure`, `toJsonSchema`, `Field`, `arrayOf`, `createRule` |
| `@zipbul/baker/rules` | Rule functions and constants: `isString`, `min()`, `isEmail()`, `arrayOf()`, etc. |

---

## License

[MIT](./LICENSE)
