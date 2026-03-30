# @zipbul/baker

데코레이터 기반 validation + transformation. 인라인 코드 생성. `reflect-metadata` 불필요.

```bash
bun add @zipbul/baker
```

`tsconfig.json`에 `"experimentalDecorators": true` 필요.

## API

### `deserialize<T>(Class, input, options?): T | BakerErrors | Promise<T | BakerErrors>`

input을 검증하고 클래스 인스턴스를 생성. sync DTO는 직접 반환. async DTO(async transform/rules)는 Promise 반환. `await` 항상 안전.

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

validation 실패 시 throw하지 않음. `SealError`는 프로그래밍 에러(@Field 누락, 금지된 필드명)에서만 throw.

### `validate(Class, input, options?): true | BakerErrors | Promise<true | BakerErrors>`

`deserialize`와 동일한 검증. 인스턴스 생성 없음.

```typescript
import { validate, isBakerError } from '@zipbul/baker';

const result = await validate(UserDto, input);
if (isBakerError(result)) { /* errors */ }
```

### `validate(input, ...rules): true | BakerErrors | Promise<true | BakerErrors>`

단일 값 ad-hoc 검증. DTO 불필요.

```typescript
const result = await validate('hello@test.com', isString, isEmail());
// result === true
```

### `serialize<T>(instance, options?): Record<string, unknown> | Promise<Record<string, unknown>>`

클래스 인스턴스를 plain object로 변환. 검증 없음. sync DTO는 직접 반환.

```typescript
import { serialize } from '@zipbul/baker';

const plain = await serialize(userInstance);
```

### `isBakerError(value): value is BakerErrors`

타입 가드. `deserialize`/`validate` 결과를 에러 타입으로 좁힘.

```typescript
interface BakerError {
  readonly path: string;     // 'name', 'address.city', 'items[0].value'
  readonly code: string;     // 'isString', 'minLength', 'invalidInput'
  readonly message?: string; // 설정된 경우 커스텀 메시지
  readonly context?: unknown; // 설정된 경우 커스텀 컨텍스트
}
```

### `configure(config): ConfigureResult`

글로벌 설정. 첫 `deserialize`/`serialize`/`validate` 호출 전에 호출.

```typescript
import { configure } from '@zipbul/baker';

configure({
  autoConvert: true,        // "123" → 123. 기본값: false
  allowClassDefaults: true, // 누락된 키에 클래스 필드 초기값 사용. 기본값: false
  stopAtFirstError: true,   // 첫 검증 실패 시 즉시 반환. 기본값: false
  forbidUnknown: true,      // 선언되지 않은 필드 거부. 기본값: false
});
```

### `createRule(name, validate): EmittableRule`

커스텀 검증 룰 생성.

```typescript
import { createRule } from '@zipbul/baker';

const isEven = createRule('isEven', (v) => typeof v === 'number' && v % 2 === 0);

const isUnique = createRule({
  name: 'isUnique',
  validate: async (v) => await db.checkUnique(v),
  constraints: { table: 'users' },
});
```

## `@Field` 데코레이터

```typescript
@Field(...rules)
@Field(...rules, options)
@Field(options)
```

### 옵션

```typescript
interface FieldOptions {
  type?: () => DtoClass | [DtoClass];        // 중첩 DTO. [Dto]는 배열
  discriminator?: {                           // 다형성 디스패치
    property: string;
    subTypes: { value: Function; name: string }[];
  };
  keepDiscriminatorProperty?: boolean;        // 결과에 discriminator 유지. 기본값: false
  rules?: EmittableRule[];                    // 배열로 룰 전달 (variadic 대안)
  optional?: boolean;                         // undefined 허용. 기본값: false
  nullable?: boolean;                         // null 허용. 기본값: false
  name?: string;                              // 양방향 키 매핑
  deserializeName?: string;                   // 입력 키 매핑
  serializeName?: string;                     // 출력 키 매핑
  exclude?: boolean | 'deserializeOnly' | 'serializeOnly';  // 필드 제외
  groups?: string[];                          // 조건부 노출
  when?: (obj: any) => boolean;               // 조건부 검증
  transform?: (params: FieldTransformParams) => unknown;     // 값 변환
  transformDirection?: 'deserializeOnly' | 'serializeOnly';  // 변환 방향
  message?: string | ((args) => string);      // 에러 메시지 오버라이드
  context?: unknown;                          // 에러 컨텍스트
  mapValue?: () => DtoClass;                  // Map 값 DTO
  setValue?: () => DtoClass;                  // Set 요소 DTO
}
```

## 룰

### 타입 체커

`isString`, `isInt`, `isBoolean`, `isDate`, `isArray`, `isObject` — 상수, `()` 불필요.

`isNumber(options?)`, `isEnum(entity)` — 팩토리, `()` 필요.

### 숫자

`min(n)`, `max(n)`, `min(n, { exclusive: true })`, `isPositive`, `isNegative`, `isDivisibleBy(n)`

### 문자열

`minLength(n)`, `maxLength(n)`, `length(min, max)`, `contains(seed)`, `notContains(seed)`, `matches(regex)`

### 포맷

`isEmail()`, `isURL()`, `isUUID(version?)`, `isIP(version?)`, `isISO8601()`, `isJSON`, `isJWT`, `isCreditCard`, `isIBAN()`, `isFQDN()`, `isMACAddress()`, `isBase64()`, `isHexColor`, `isSemVer`, `isMongoId`, `isPhoneNumber`, `isStrongPassword()`

### 배열

`arrayMinSize(n)`, `arrayMaxSize(n)`, `arrayUnique()`, `arrayNotEmpty`, `arrayContains(values)`, `arrayOf(...rules)`

### 공통

`equals(val)`, `notEquals(val)`, `isIn(values)`, `isNotIn(values)`, `isEmpty`, `isNotEmpty`

### 날짜

`minDate(date)`, `maxDate(date)`

### 로케일

`isMobilePhone(locale)`, `isPostalCode(locale)`, `isIdentityCard(locale)`, `isPassportNumber(locale)`

## 중첩 DTO

```typescript
class AddressDto {
  @Field(isString) city!: string;
}

class UserDto {
  @Field({ type: () => AddressDto }) address!: AddressDto;
  @Field({ type: () => [AddressDto] }) addresses!: AddressDto[];
}
```

## 컬렉션

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

## 상속

```typescript
class BaseDto {
  @Field(isString) id!: string;
}

class UserDto extends BaseDto {
  @Field(isString) name!: string;
  // 'id' 필드와 isString 룰 상속
}
```

## Exports

```typescript
// 함수
import { deserialize, validate, serialize, configure, createRule } from '@zipbul/baker';

// 데코레이터
import { Field, arrayOf } from '@zipbul/baker';

// 에러 처리
import { isBakerError, SealError } from '@zipbul/baker';

// 타입
import type {
  BakerError, BakerErrors, FieldOptions, FieldTransformParams,
  ArrayOfMarker, EmittableRule, BakerConfig, ConfigureResult, RuntimeOptions,
} from '@zipbul/baker';

// 룰 (subpath)
import { isString, isNumber, ... } from '@zipbul/baker/rules';
```

## Baker가 하지 않는 것

- JSON Schema / OpenAPI 생성
- GraphQL 스키마 생성
- 스키마로부터 런타임 타입 추론
- `reflect-metadata` 의존성

## 라이선스

MIT
