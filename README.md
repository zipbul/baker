# @zipbul/baker

Decorator-based validation + transformation with inline code generation. Zero `reflect-metadata`.

```bash
bun add @zipbul/baker
```

Requires `"experimentalDecorators": true` in `tsconfig.json`.

## API

### `deserialize<T>(Class, input, options?): T | BakerErrors | Promise<T | BakerErrors>`

Validates input and creates a class instance. Sync DTOs return directly. Async DTOs (async transform/rules) return Promise. Always safe to `await`.

```typescript
import { deserialize, isBakerError, Field } from '@zipbul/baker';
import { isString, isNumber, isEmail, min, minLength } from '@zipbul/baker/rules';

class UserDto {
  @Field(isString, minLength(2)) name!: string;
  @Field(isNumber(), min(0)) age!: number;
  @Field(isString, isEmail()) email!: string;
}

const result = await deserialize(UserDto, { name: 'Alice', age: 30, email: 'alice@test.com' });

if (isBakerError(result)) {
  console.log(result.errors); // { path: string, code: string }[]
} else {
  console.log(result.name);  // 'Alice'
}
```

Never throws on validation failure. Throws `SealError` only for programming errors (no `@Field` decorators, banned field names).

### `validate(Class, input, options?): true | BakerErrors | Promise<true | BakerErrors>`

Same validation as `deserialize` without instance creation.

```typescript
import { validate, isBakerError } from '@zipbul/baker';

const result = await validate(UserDto, input);
if (isBakerError(result)) { /* errors */ }
```

### `validate(input, ...rules): true | BakerErrors | Promise<true | BakerErrors>`

Ad-hoc single value validation. No DTO needed.

```typescript
const result = await validate('hello@test.com', isString, isEmail());
// result === true
```

### `serialize<T>(instance, options?): Record<string, unknown> | Promise<Record<string, unknown>>`

Converts a class instance to a plain object. No validation. Sync DTOs return directly.

```typescript
import { serialize } from '@zipbul/baker';

const plain = await serialize(userInstance);
```

### `isBakerError(value): value is BakerErrors`

Type guard. Narrows `deserialize`/`validate` result to error type.

```typescript
interface BakerError {
  readonly path: string;     // 'name', 'address.city', 'items[0].value'
  readonly code: string;     // 'isString', 'minLength', 'invalidInput'
  readonly message?: string; // custom message if set
  readonly context?: unknown; // custom context if set
}
```

### `configure(config): ConfigureResult`

Global configuration. Call before first `deserialize`/`serialize`/`validate`.

```typescript
import { configure } from '@zipbul/baker';

configure({
  autoConvert: true,        // "123" → 123. Default: false
  allowClassDefaults: true, // use class field initializers for missing keys. Default: false
  stopAtFirstError: true,   // return on first validation failure. Default: false
  forbidUnknown: true,      // reject undeclared fields. Default: false
});
```

### `createRule(name, validate): EmittableRule`

Creates a custom validation rule.

```typescript
import { createRule } from '@zipbul/baker';

const isEven = createRule('isEven', (v) => typeof v === 'number' && v % 2 === 0);

const isUnique = createRule({
  name: 'isUnique',
  validate: async (v) => await db.checkUnique(v),
  constraints: { table: 'users' },
});
```

## `@Field` Decorator

```typescript
@Field(...rules)
@Field(...rules, options)
@Field(options)
```

### Options

```typescript
interface FieldOptions {
  type?: () => DtoClass | [DtoClass];        // nested DTO. [Dto] for arrays
  discriminator?: {                           // polymorphic dispatch
    property: string;
    subTypes: { value: Function; name: string }[];
  };
  keepDiscriminatorProperty?: boolean;        // preserve discriminator in result. Default: false
  rules?: EmittableRule[];                    // rules as array (alternative to variadic)
  optional?: boolean;                         // allow undefined. Default: false
  nullable?: boolean;                         // allow null. Default: false
  name?: string;                              // bidirectional key mapping
  deserializeName?: string;                   // input key mapping
  serializeName?: string;                     // output key mapping
  exclude?: boolean | 'deserializeOnly' | 'serializeOnly';  // field exclusion
  groups?: string[];                          // conditional visibility
  when?: (obj: any) => boolean;               // conditional validation
  transform?: (params: FieldTransformParams) => unknown;     // value transform
  transformDirection?: 'deserializeOnly' | 'serializeOnly';  // transform direction
  message?: string | ((args) => string);      // error message override
  context?: unknown;                          // error context
  mapValue?: () => DtoClass;                  // Map value DTO
  setValue?: () => DtoClass;                  // Set element DTO
}
```

## Rules

### Type Checkers

`isString`, `isInt`, `isBoolean`, `isDate`, `isArray`, `isObject` — constants, no `()`.

`isNumber(options?)`, `isEnum(entity)` — factories, need `()`.

### Numbers

`min(n)`, `max(n)`, `min(n, { exclusive: true })`, `isPositive`, `isNegative`, `isDivisibleBy(n)`

### Strings

`minLength(n)`, `maxLength(n)`, `length(min, max)`, `contains(seed)`, `notContains(seed)`, `matches(regex)`

### Formats

`isEmail()`, `isURL()`, `isUUID(version?)`, `isIP(version?)`, `isISO8601()`, `isJSON`, `isJWT`, `isCreditCard`, `isIBAN()`, `isFQDN()`, `isMACAddress()`, `isBase64()`, `isHexColor`, `isSemVer`, `isMongoId`, `isPhoneNumber`, `isStrongPassword()`

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
  @Field({ type: () => Map as any, mapValue: () => TagDto }) tagMap!: Map<string, TagDto>;
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

## Exports

```typescript
// Functions
import { deserialize, validate, serialize, configure, createRule } from '@zipbul/baker';

// Decorators
import { Field, arrayOf } from '@zipbul/baker';

// Error handling
import { isBakerError, SealError } from '@zipbul/baker';

// Types
import type {
  BakerError, BakerErrors, FieldOptions, FieldTransformParams,
  ArrayOfMarker, EmittableRule, BakerConfig, ConfigureResult, RuntimeOptions,
} from '@zipbul/baker';

// Rules (subpath)
import { isString, isNumber, ... } from '@zipbul/baker/rules';
```

## What Baker Does Not Do

- JSON Schema / OpenAPI generation
- GraphQL schema generation
- Runtime type inference from schemas
- `reflect-metadata` dependency

## License

MIT
