<p align="center">
  <h1 align="center">@zipbul/baker</h1>
  <p align="center">
    <strong>Decorator-based validate + transform with inline code generation</strong>
  </p>
  <p align="center">
    class-validator DX · AOT-level performance · zero reflect-metadata
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

## 🤔 Why Baker?

| | class-validator | Zod | TypeBox | **Baker** |
|---|---|---|---|---|
| Schema style | Decorators | Function chaining | JSON Schema builder | **Decorators** |
| Performance | Runtime interpreter | Runtime interpreter | JIT compile | **`new Function()` inline codegen** |
| Transform built-in | Separate package | `.transform()` | ✗ | **Unified** |
| reflect-metadata | Required | N/A | N/A | **Not needed** |
| class-validator migration | — | Full rewrite | Full rewrite | **Near drop-in** |

Baker gives you the **familiar decorator DX** of class-validator while generating optimized validation + transformation functions via `new Function()` at seal time — delivering **AOT-equivalent performance without a compiler plugin**.

---

## ✨ Features

- 🎯 **Decorator-first** — `@IsString()`, `@Min()`, `@IsEmail()` and 80+ built-in validators
- ⚡ **Inline code generation** — `seal()` compiles validators into optimized functions, no runtime interpretation
- 🔄 **Unified validate + transform** — `deserialize()` and `serialize()` in one async call
- 🪶 **Zero reflect-metadata** — no `reflect-metadata` import needed
- 🔁 **Circular reference detection** — automatic static analysis at seal time
- 🏷️ **Group-based validation** — apply different rules per request with `groups`
- 🧩 **Custom rules** — `createRule()` for user-defined validators with codegen support
- 🚀 **AOT mode** — zipbul CLI generates code at build time, eliminating runtime `seal()` cost

---

## 📦 Installation

```bash
bun add @zipbul/baker
```

> **Requirements:** Bun ≥ 1.0, `experimentalDecorators: true` in tsconfig.json

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

---

## 🚀 Quick Start

### 1. Define a DTO

```typescript
import { IsString, IsInt, IsEmail, Min, Max } from '@zipbul/baker/decorators';

class CreateUserDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(0)
  @Max(120)
  age!: number;

  @IsEmail()
  email!: string;
}
```

### 2. Seal at startup

```typescript
import { seal } from '@zipbul/baker';

// Compiles all registered DTOs into optimized validators
seal();
```

### 3. Deserialize per request

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

### 4. Serialize

```typescript
import { serialize } from '@zipbul/baker';

const plain = await serialize(userInstance);
// plain: Record<string, unknown>
```

---

## 🏗️ Decorators

### Type Checkers

| Decorator | Description |
|---|---|
| `@IsString()` | `typeof === 'string'` |
| `@IsNumber(opts?)` | `typeof === 'number'` with NaN/Infinity checks |
| `@IsInt()` | Integer check |
| `@IsBoolean()` | `typeof === 'boolean'` |
| `@IsDate()` | `instanceof Date && !isNaN` |
| `@IsEnum(enumObj)` | Enum value check |
| `@IsArray()` | `Array.isArray()` |
| `@IsObject()` | `typeof === 'object'`, excludes null/Array |

### Common

| Decorator | Description |
|---|---|
| `@IsDefined()` | `!== undefined && !== null` |
| `@IsOptional()` | Skip subsequent rules if value is absent |
| `@IsNotEmpty()` | `!== undefined && !== null && !== ''` |
| `@IsEmpty()` | `=== undefined \|\| === null \|\| === ''` |
| `@Equals(val)` | `=== val` |
| `@NotEquals(val)` | `!== val` |
| `@IsIn(values)` | Value is in the given array |
| `@IsNotIn(values)` | Value is not in the given array |
| `@ValidateNested()` | Validate nested DTO |
| `@ValidateIf(fn)` | Conditional validation |

### Number

| Decorator | Description |
|---|---|
| `@Min(n)` | `value >= n` |
| `@Max(n)` | `value <= n` |
| `@IsPositive()` | `value > 0` |
| `@IsNegative()` | `value < 0` |
| `@IsInRange(min, max)` | `min <= value <= max` |
| `@IsDivisibleBy(n)` | `value % n === 0` |

### String

<details>
<summary>50+ string validators — click to expand</summary>

| Decorator | Description |
|---|---|
| `@MinLength(n)` | Minimum length |
| `@MaxLength(n)` | Maximum length |
| `@Length(min, max)` | Length range |
| `@Contains(seed)` | Contains substring |
| `@NotContains(seed)` | Does not contain substring |
| `@Matches(pattern)` | Regex match |
| `@IsAlpha()` | Alphabetic only |
| `@IsAlphanumeric()` | Alphanumeric only |
| `@IsNumeric()` | Numeric string |
| `@IsEmail(opts?)` | Email format |
| `@IsURL(opts?)` | URL format |
| `@IsUUID(version?)` | UUID v1–v5 |
| `@IsIP(version?)` | IPv4 / IPv6 |
| `@IsMACAddress()` | MAC address |
| `@IsISBN(version?)` | ISBN-10 / ISBN-13 |
| `@IsISIN()` | ISIN |
| `@IsIBAN()` | IBAN |
| `@IsJSON()` | Parseable JSON string |
| `@IsBase64()` | Base64 encoded |
| `@IsBase32()` | Base32 encoded |
| `@IsBase58()` | Base58 encoded |
| `@IsHexColor()` | Hex color code |
| `@IsHSL()` | HSL color |
| `@IsRgbColor()` | RGB color |
| `@IsHexadecimal()` | Hex string |
| `@IsBIC()` | BIC/SWIFT code |
| `@IsISRC()` | ISRC code |
| `@IsEAN()` | EAN barcode |
| `@IsMimeType()` | MIME type |
| `@IsMagnetURI()` | Magnet URI |
| `@IsCreditCard()` | Credit card number |
| `@IsHash(algorithm)` | Hash (`md5 \| sha1 \| sha256 \| sha512` etc.) |
| `@IsRFC3339()` | RFC 3339 date |
| `@IsMilitaryTime()` | 24h format (`HH:MM`) |
| `@IsLatitude()` | Latitude (-90 ~ 90) |
| `@IsLongitude()` | Longitude (-180 ~ 180) |
| `@IsEthereumAddress()` | Ethereum address |
| `@IsBtcAddress()` | Bitcoin address (P2PKH/P2SH/bech32) |
| `@IsISO4217CurrencyCode()` | ISO 4217 currency code |
| `@IsPhoneNumber()` | E.164 international phone number |
| `@IsStrongPassword(opts?)` | Strong password |
| `@IsSemVer()` | Semantic version |
| `@IsISO8601()` | ISO 8601 date string |
| `@IsMongoId()` | MongoDB ObjectId |
| `@IsTaxId(locale)` | Tax ID by locale |

</details>

### Date

| Decorator | Description |
|---|---|
| `@MinDate(date)` | Minimum date |
| `@MaxDate(date)` | Maximum date |

### Array

| Decorator | Description |
|---|---|
| `@ArrayContains(values)` | Contains all given elements |
| `@ArrayNotContains(values)` | Contains none of the given elements |
| `@ArrayMinSize(n)` | Minimum array length |
| `@ArrayMaxSize(n)` | Maximum array length |
| `@ArrayUnique()` | No duplicates |
| `@ArrayNotEmpty()` | Not empty |

### Locale-specific

| Decorator | Description |
|---|---|
| `@IsMobilePhone(locale)` | Mobile phone by locale |
| `@IsPostalCode(locale)` | Postal code by locale |
| `@IsIdentityCard(locale)` | Identity card by locale |
| `@IsPassportNumber(locale)` | Passport number by locale |

### Transform & Type

| Decorator | Description |
|---|---|
| `@Transform(fn, opts?)` | Custom transform function |
| `@Type(fn)` | Nested DTO type + implicit conversion |
| `@Expose(opts?)` | Control property exposure |
| `@Exclude(opts?)` | Exclude property from serialization |

---

## ⚙️ Validation Options

Every validation decorator accepts `ValidationOptions` as its last argument:

```typescript
interface ValidationOptions {
  each?: boolean;        // Apply rule to each array element
  groups?: string[];     // Groups this rule belongs to
  message?: string | ((args: {
    property: string;
    value: unknown;
    constraints: unknown[];
  }) => string);          // Custom error message
  context?: unknown;     // Arbitrary context attached to error
}
```

**Example:**

```typescript
class UserDto {
  @IsString({ message: 'Name must be a string' })
  name!: string;

  @IsInt({
    message: ({ property }) => `${property} must be an integer`,
    context: { httpStatus: 400 },
  })
  age!: number;
}
```

---

## 🚨 Error Handling

When validation fails, `deserialize()` throws a `BakerValidationError`:

```typescript
class BakerValidationError extends Error {
  readonly errors: BakerError[];
  readonly className: string;
}
```

Each error follows the `BakerError` interface:

```typescript
interface BakerError {
  readonly path: string;      // Field path ('user.address.city')
  readonly code: string;      // Error code ('isString', 'min', 'isEmail')
  readonly message?: string;  // Custom message (when message option is set)
  readonly context?: unknown; // Custom context (when context option is set)
}
```

---

## 📋 Array Validation

Use `each: true` to apply rules to each element of an Array, Set, or Map:

```typescript
class TagsDto {
  @IsString({ each: true })
  tags!: string[];
}
```

---

## 🏷️ Group-based Validation

Apply different rules depending on the use case:

```typescript
class UserDto {
  @IsString({ groups: ['create'] })
  name!: string;

  @IsEmail({ groups: ['create', 'update'] })
  email!: string;
}

// Only validate rules in the 'create' group
const user = await deserialize(UserDto, body, { groups: ['create'] });
```

---

## 🪆 Nested Objects

```typescript
import { ValidateNested, Type } from '@zipbul/baker/decorators';

class AddressDto {
  @IsString()
  city!: string;
}

class UserDto {
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}
```

---

## 🧩 Custom Rules

Create user-defined validation rules with codegen support:

```typescript
import { createRule } from '@zipbul/baker';

const isPositiveInt = createRule({
  name: 'isPositiveInt',
  validate: (value) => Number.isInteger(value) && (value as number) > 0,
  emit: (varName, ctx) =>
    `if (!Number.isInteger(${varName}) || ${varName} <= 0) ${ctx.fail('isPositiveInt')};`,
});
```

---

## ⚙️ Seal Options

```typescript
seal({
  enableImplicitConversion: false, // Auto-convert types based on decorators
  enableCircularCheck: 'auto',     // Detect circular references ('auto' | true | false)
  exposeDefaultValues: false,      // Use class defaults for missing keys
  stopAtFirstError: false,         // Stop at first error or collect all
  debug: false,                    // Store generated source for inspection
});
```

---

## 🔧 AOT Mode

With the **zipbul CLI**, you can generate validation code at build time — eliminating the runtime `seal()` cost entirely.

In AOT mode, use the `/aot` import (no-op stub decorators):

```typescript
import { IsString } from '@zipbul/baker/aot';
```

The CLI replaces these stubs with pre-generated validation code during the build step.

---

## 📂 Subpath Exports

| Import path | Purpose |
|---|---|
| `@zipbul/baker` | Main API: `seal`, `deserialize`, `serialize`, all decorators |
| `@zipbul/baker/decorators` | Decorators only |
| `@zipbul/baker/aot` | No-op stub decorators for AOT mode |
| `@zipbul/baker/rules` | Raw rule objects |
| `@zipbul/baker/symbols` | Internal symbols |

---

## 🔍 How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  Decorators  │ ──▶ │   seal()     │ ──▶ │ new Function() code │
│  (metadata)  │     │  at startup  │     │   (inline codegen)  │
└─────────────┘     └──────────────┘     └──────────┬──────────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │   deserialize() /   │
                                          │    serialize()      │
                                          │ (execute generated) │
                                          └─────────────────────┘
```

1. **Decorators** attach validation metadata to class properties at definition time
2. **`seal()`** reads all metadata, analyzes circular references, and generates inline JavaScript functions via `new Function()`
3. **`deserialize()` / `serialize()`** execute the generated function — no interpretation loops, just straight-line optimized code

---

## 📄 License

[MIT](./LICENSE) © [Junhyung Park](https://github.com/parkrevil)
