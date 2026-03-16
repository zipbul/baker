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
- **80+ built-in rules** — `isString()`, `min()`, `isEmail()` and more, composed as arguments
- **Inline code generation** — auto-seal compiles validators at first `deserialize()`/`serialize()` call
- **Unified validate + transform** — `deserialize()` and `serialize()` in one async call
- **Zero reflect-metadata** — no `reflect-metadata` import needed
- **Circular reference detection** — automatic static analysis at seal time
- **Group-based validation** — apply different rules per request with `groups`
- **Custom rules** — `createRule()` for user-defined validators with codegen support
- **JSON Schema output** — `toJsonSchema()` generates JSON Schema Draft 2020-12 from your DTOs
- **Polymorphic discriminator** — `@Field({ discriminator })` for union types
- **Whitelist mode** — reject undeclared fields with `configure({ forbidUnknown: true })`

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
  @Field(isString())
  name!: string;

  @Field(isInt(), min(0), max(120))
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
@Field(isString(), minLength(3), maxLength(100))

// Options only
@Field({ optional: true, nullable: true })

// Rules + options
@Field(isString(), { name: 'user_name', groups: ['create'] })

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

---

## Built-in Rules

All rules are imported from `@zipbul/baker/rules` and passed as arguments to `@Field()`.

### Type Checkers

| Rule | Description |
|---|---|
| `isString()` | `typeof === 'string'` |
| `isNumber(opts?)` | `typeof === 'number'` with NaN/Infinity/maxDecimalPlaces checks |
| `isInt()` | Integer check |
| `isBoolean()` | `typeof === 'boolean'` |
| `isDate()` | `instanceof Date && !isNaN` |
| `isEnum(enumObj)` | Enum value check |
| `isArray()` | `Array.isArray()` |
| `isObject()` | `typeof === 'object'`, excludes null/Array |

### Number

| Rule | Description |
|---|---|
| `min(n)` | `value >= n` (supports `{ exclusive: true }`) |
| `max(n)` | `value <= n` (supports `{ exclusive: true }`) |
| `isPositive` | `value > 0` |
| `isNegative` | `value < 0` |
| `isDivisibleBy(n)` | `value % n === 0` |

### String

<details>
<summary>50+ string validators — click to expand</summary>

| Rule | Description |
|---|---|
| `minLength(n)` | Minimum length |
| `maxLength(n)` | Maximum length |
| `length(min, max)` | Length range |
| `contains(seed)` | Contains substring |
| `notContains(seed)` | Does not contain substring |
| `matches(pattern)` | Regex match |
| `isAlpha()` | Alphabetic only |
| `isAlphanumeric()` | Alphanumeric only |
| `isEmail(opts?)` | Email format |
| `isURL(opts?)` | URL format (port range validated) |
| `isUUID(version?)` | UUID v1-v5 |
| `isIP(version?)` | IPv4 / IPv6 |
| `isMACAddress()` | MAC address |
| `isISBN(version?)` | ISBN-10 / ISBN-13 |
| `isJSON()` | Parseable JSON string |
| `isBase64()` | Base64 encoded |
| `isCreditCard()` | Credit card (Luhn) |
| `isISO8601()` | ISO 8601 date string |
| `isSemVer()` | Semantic version |
| `isMongoId()` | MongoDB ObjectId |
| `isPhoneNumber()` | E.164 international phone |
| `isStrongPassword(opts?)` | Strong password |
| ... and 30+ more | |

</details>

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

### Validation Options

Every rule accepts an options argument for `each`, `groups`, `message`, and `context`:

```typescript
class UserDto {
  @Field(isString({ message: 'Name must be a string' }))
  name!: string;

  @Field(isInt({ each: true, groups: ['admin'] }))
  scores!: number[];
}
```

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
  @Field(isString())
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
  @Field(isString()) breed!: string;
}
class CatDto {
  @Field(isBoolean()) indoor!: boolean;
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
| `@zipbul/baker` | Main API: `deserialize`, `serialize`, `configure`, `toJsonSchema`, `Field`, `createRule` |
| `@zipbul/baker/rules` | Rule functions: `isString()`, `min()`, `isEmail()`, etc. |

---

## License

[MIT](./LICENSE)
