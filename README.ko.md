<p align="center">
  <h1 align="center">@zipbul/baker</h1>
  <p align="center">
    <strong>데코레이터 기반 validate + transform — 인라인 코드 생성</strong>
  </p>
  <p align="center">
    단일 <code>@Field()</code> 데코레이터 &middot; AOT급 성능 &middot; reflect-metadata 불필요
  </p>
  <p align="center">
    <a href="https://github.com/zipbul/baker/actions"><img src="https://github.com/zipbul/baker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/@zipbul/baker"><img src="https://img.shields.io/npm/v/@zipbul/baker.svg" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/@zipbul/baker"><img src="https://img.shields.io/npm/dm/@zipbul/baker.svg" alt="npm downloads"></a>
    <a href="https://github.com/zipbul/baker/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@zipbul/baker.svg" alt="license"></a>
  </p>
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

---

## 왜 Baker인가?

| | class-validator | Zod | TypeBox | **Baker** |
|---|---|---|---|---|
| 스키마 방식 | 데코레이터 | 함수 체이닝 | JSON Schema 빌더 | **단일 `@Field()` 데코레이터** |
| 성능 | 런타임 인터프리터 | 런타임 인터프리터 | JIT 컴파일 | **`new Function()` 인라인 코드생성** |
| Transform 내장 | 별도 패키지 | `.transform()` | N/A | **통합** |
| reflect-metadata | 필수 | N/A | N/A | **불필요** |
| class-validator 마이그레이션 | — | 전면 재작성 | 전면 재작성 | **거의 그대로** |

Baker는 검증, 변환, 노출 제어, 타입 힌트를 결합하는 **단일 `@Field()` 데코레이터**를 제공합니다. 첫 사용 시 `new Function()`으로 최적화된 함수를 생성하여 모든 DTO를 자동으로 seal합니다 — **컴파일러 플러그인 없이 AOT 수준의 성능**을 제공합니다.

---

## 주요 기능

- **단일 데코레이터** — `@Field()`가 30개 이상의 개별 데코레이터를 대체
- **80개 이상의 내장 규칙** — `isString`, `min()`, `isEmail()` 등을 인자로 조합
- **인라인 코드 생성** — 첫 `deserialize()`/`serialize()` 호출 시 auto-seal로 검증기를 컴파일
- **검증 + 변환 통합** — `deserialize()`와 `serialize()`를 하나의 호출로 (동기 DTO는 비동기 오버헤드 없음)
- **throw 없는 검증** — try/catch 대신 `isBakerError()` 타입 가드 사용
- **독립 `validate()`** — DTO 레벨 또는 단일 값 애드혹 검증
- **reflect-metadata 불필요** — `reflect-metadata` import 없이 동작
- **순환 참조 감지** — seal 시점에 자동 정적 분석
- **그룹 기반 검증** — `groups` 옵션으로 요청별 다른 규칙 적용
- **커스텀 규칙** — `createRule()`로 코드생성을 지원하는 사용자 정의 검증기 작성
- **다형성 discriminator** — `@Field({ discriminator })`로 유니온 타입 지원
- **Whitelist 모드** — `configure({ forbidUnknown: true })`로 미선언 필드 거부
- **클래스 상속** — 자식 DTO가 부모 `@Field()` 데코레이터를 자동으로 상속
- **비동기 transform** — transform 함수에 async 사용 가능
- **Map/Set 지원** — `Map`/`Set`과 JSON 호환 타입 간 자동 변환
- **필드별 에러 메시지** — `@Field()`의 `message`와 `context` 옵션으로 커스텀 에러

---

## 설치

```bash
bun add @zipbul/baker
```

> **요구사항:** Bun >= 1.0, tsconfig.json에 `experimentalDecorators: true` 설정

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

---

## 빠른 시작

### 1. DTO 정의

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

### 2. Deserialize (첫 호출 시 auto-seal)

```typescript
import { deserialize, isBakerError } from '@zipbul/baker';

const result = await deserialize(CreateUserDto, requestBody);

if (isBakerError(result)) {
  // 검증 실패
  console.log(result.errors); // BakerError[]
} else {
  // result는 검증 완료된 CreateUserDto 인스턴스
  console.log(result.name);
}
```

### 3. Serialize

```typescript
import { serialize } from '@zipbul/baker';

const plain = await serialize(userInstance);
// plain: Record<string, unknown>
```

> `seal()` 호출이 필요 없습니다 — baker는 첫 `deserialize()`, `serialize()`, 또는 `validate()` 호출 시 등록된 모든 DTO를 자동으로 seal합니다.

---

## `@Field()` 데코레이터

`@Field()`는 모든 개별 데코레이터를 대체하는 단일 데코레이터입니다. 검증 규칙을 위치 인자로, 고급 기능은 옵션 객체로 전달합니다.

### 시그니처

```typescript
// 규칙만
@Field(isString, minLength(3), maxLength(100))

// 옵션만
@Field({ optional: true, nullable: true })

// 규칙 + 옵션
@Field(isString, { name: 'user_name', groups: ['create'] })

// 규칙 없이 (단순 필드)
@Field()
```

### FieldOptions

```typescript
interface FieldOptions {
  type?: () => Constructor | [Constructor];   // 중첩 DTO 타입 (순환 참조를 위한 thunk)
  discriminator?: {                           // 다형성 유니온
    property: string;
    subTypes: { value: Function; name: string }[];
  };
  keepDiscriminatorProperty?: boolean;        // 출력에 discriminator 키 유지
  rules?: (EmittableRule | ArrayOfMarker)[];  // 검증 규칙 (위치 인자 대안)
  optional?: boolean;                         // undefined 허용
  nullable?: boolean;                         // null 허용
  name?: string;                              // JSON 키 매핑 (양방향)
  deserializeName?: string;                   // 역직렬화 전용 키 매핑
  serializeName?: string;                     // 직렬화 전용 키 매핑
  exclude?: boolean | 'deserializeOnly' | 'serializeOnly';
  groups?: string[];                          // 가시성 + 조건부 검증
  when?: (obj: any) => boolean;               // 조건부 검증
  transform?: (params: FieldTransformParams) => unknown;
  transformDirection?: 'deserializeOnly' | 'serializeOnly';
  message?: string | ((args: MessageArgs) => string); // 모든 규칙의 에러 메시지
  context?: unknown;                                   // 모든 규칙의 에러 컨텍스트
  mapValue?: () => Constructor;                        // Map 값 DTO 타입
  setValue?: () => Constructor;                        // Set 요소 DTO 타입
}
```

### 필드별 에러 메시지

`message`와 `context`로 검증 에러 출력을 커스터마이즈합니다:

```typescript
@Field(isString, minLength(3), { message: 'Name is invalid' })
name!: string;

@Field(isEmail(), {
  message: ({ property, value }) => `${property} got bad value: ${value}`,
  context: { severity: 'error' },
})
email!: string;
```

`message`와 `context`는 해당 필드의 모든 규칙에 적용됩니다. 검증 실패 시 `BakerError.message`와 `BakerError.context`에 포함됩니다.

### `arrayOf()` — 배열 요소 검증

`arrayOf()`는 배열의 각 요소에 규칙을 적용합니다. `@zipbul/baker/rules` 또는 `@zipbul/baker`에서 import합니다.

```typescript
import { Field, arrayOf } from '@zipbul/baker';
import { isString, minLength } from '@zipbul/baker/rules';

class TagsDto {
  @Field(arrayOf(isString, minLength(1)))
  tags!: string[];
}
```

`arrayOf()`를 최상위 배열 규칙과 함께 사용할 수 있습니다:

```typescript
import { arrayMinSize, arrayMaxSize } from '@zipbul/baker/rules';

class ScoresDto {
  @Field(arrayMinSize(1), arrayMaxSize(10), arrayOf(isInt, min(0), max(100)))
  scores!: number[];
}
```

---

## Validate

`validate()`는 인스턴스를 생성하지 않고 입력을 검사합니다. 두 가지 모드가 있습니다:

### DTO 레벨 검증

```typescript
import { validate, isBakerError } from '@zipbul/baker';

const result = await validate(CreateUserDto, input);

if (isBakerError(result)) {
  console.log(result.errors); // BakerError[]
} else {
  // result === true
}
```

### 애드혹 검증

DTO 없이 단일 값을 하나 이상의 규칙으로 직접 검증합니다:

```typescript
import { validate, isBakerError } from '@zipbul/baker';
import { isString, isEmail } from '@zipbul/baker/rules';

const result = validate('hello@test.com', isString, isEmail());
// result === true

const bad = validate(42, isString);
if (isBakerError(bad)) {
  console.log(bad.errors); // [{ path: '', code: 'isString' }]
}
```

---

## 내장 규칙

모든 규칙은 `@zipbul/baker/rules`에서 import하며 `@Field()`의 인자로 전달합니다.

> **상수 vs 팩토리 함수:** 일부 규칙은 미리 만들어진 상수로 `()` 없이 사용하고, 나머지는 매개변수를 받는 팩토리 함수로 `()`와 함께 사용합니다. 아래 표에서 상수는 별도로 표기합니다.

### 타입 검사

| 규칙 | 설명 |
|---|---|
| `isString` | `typeof === 'string'` |
| `isNumber(opts?)` | `typeof === 'number'` + NaN/Infinity/maxDecimalPlaces 검사 |
| `isInt` | 정수 검사 |
| `isBoolean` | `typeof === 'boolean'` |
| `isDate` | `instanceof Date && !isNaN` |
| `isEnum(enumObj)` | 열거형 값 검사 |
| `isArray` | `Array.isArray()` |
| `isObject` | `typeof === 'object'`, null/Array 제외 |

> `isString`, `isInt`, `isBoolean`, `isDate`, `isArray`, `isObject`는 상수(괄호 불필요). `isNumber(opts?)`와 `isEnum(enumObj)`는 팩토리 함수.

### 공통

| 규칙 | 설명 |
|---|---|
| `equals(val)` | 엄격 동등 비교 (`===`) |
| `notEquals(val)` | 엄격 비동등 비교 (`!==`) |
| `isEmpty` | `undefined`, `null`, 또는 `''` |
| `isNotEmpty` | `undefined`, `null`, `''`이 아님 |
| `isIn(arr)` | 주어진 배열에 포함 |
| `isNotIn(arr)` | 주어진 배열에 미포함 |

> `isEmpty`와 `isNotEmpty`는 상수. 나머지는 팩토리 함수.

### 숫자

| 규칙 | 설명 |
|---|---|
| `min(n, opts?)` | `value >= n` (`{ exclusive: true }` 지원) |
| `max(n, opts?)` | `value <= n` (`{ exclusive: true }` 지원) |
| `isPositive` | `value > 0` |
| `isNegative` | `value < 0` |
| `isDivisibleBy(n)` | `value % n === 0` |

> `isPositive`와 `isNegative`는 상수(괄호 없음). `min()`, `max()`, `isDivisibleBy()`는 팩토리 함수.

### 문자열

모든 문자열 규칙은 값이 `string` 타입이어야 합니다.

| 규칙 | 종류 | 설명 |
|---|---|---|
| `minLength(n)` | 팩토리 | 최소 길이 |
| `maxLength(n)` | 팩토리 | 최대 길이 |
| `length(min, max)` | 팩토리 | 길이 범위 |
| `contains(seed)` | 팩토리 | 부분 문자열 포함 |
| `notContains(seed)` | 팩토리 | 부분 문자열 미포함 |
| `matches(pattern, modifiers?)` | 팩토리 | 정규식 매치 |
| `isLowercase` | 상수 | 전체 소문자 |
| `isUppercase` | 상수 | 전체 대문자 |
| `isAscii` | 상수 | ASCII만 |
| `isAlpha` | 상수 | 알파벳만 (en-US) |
| `isAlphanumeric` | 상수 | 알파벳/숫자만 (en-US) |
| `isBooleanString` | 상수 | `'true'`, `'false'`, `'1'`, 또는 `'0'` |
| `isNumberString(opts?)` | 팩토리 | 숫자 문자열 |
| `isDecimal(opts?)` | 팩토리 | 소수 문자열 |
| `isFullWidth` | 상수 | 전각 문자 |
| `isHalfWidth` | 상수 | 반각 문자 |
| `isVariableWidth` | 상수 | 전각/반각 혼합 |
| `isMultibyte` | 상수 | 멀티바이트 문자 |
| `isSurrogatePair` | 상수 | 서로게이트 페어 문자 |
| `isHexadecimal` | 상수 | 16진수 문자열 |
| `isOctal` | 상수 | 8진수 문자열 |
| `isEmail(opts?)` | 팩토리 | 이메일 형식 |
| `isURL(opts?)` | 팩토리 | URL 형식 (포트 범위 검증) |
| `isUUID(version?)` | 팩토리 | UUID v1-v5 |
| `isIP(version?)` | 팩토리 | IPv4 / IPv6 |
| `isHexColor` | 상수 | Hex 색상 (`#fff`, `#ffffff`) |
| `isRgbColor(includePercent?)` | 팩토리 | RGB 색상 문자열 |
| `isHSL` | 상수 | HSL 색상 문자열 |
| `isMACAddress(opts?)` | 팩토리 | MAC 주소 |
| `isISBN(version?)` | 팩토리 | ISBN-10 / ISBN-13 |
| `isISIN` | 상수 | ISIN (국제증권식별번호) |
| `isISO8601(opts?)` | 팩토리 | ISO 8601 날짜 문자열 |
| `isISRC` | 상수 | ISRC (국제표준녹음코드) |
| `isISSN(opts?)` | 팩토리 | ISSN (국제표준일련번호) |
| `isJWT` | 상수 | JSON Web Token |
| `isLatLong(opts?)` | 팩토리 | 위도/경도 문자열 |
| `isLocale` | 상수 | 로케일 문자열 (예: `en_US`) |
| `isDataURI` | 상수 | Data URI |
| `isFQDN(opts?)` | 팩토리 | 정규화된 도메인 이름 |
| `isPort` | 상수 | 포트 번호 문자열 (0-65535) |
| `isEAN` | 상수 | EAN (유럽상품번호) |
| `isISO31661Alpha2` | 상수 | ISO 3166-1 alpha-2 국가 코드 |
| `isISO31661Alpha3` | 상수 | ISO 3166-1 alpha-3 국가 코드 |
| `isBIC` | 상수 | BIC (은행식별코드) / SWIFT 코드 |
| `isFirebasePushId` | 상수 | Firebase Push ID |
| `isSemVer` | 상수 | 시맨틱 버전 문자열 |
| `isMongoId` | 상수 | MongoDB ObjectId (24자 hex) |
| `isJSON` | 상수 | JSON 파싱 가능 문자열 |
| `isBase32(opts?)` | 팩토리 | Base32 인코딩 |
| `isBase58` | 상수 | Base58 인코딩 |
| `isBase64(opts?)` | 팩토리 | Base64 인코딩 |
| `isDateString(opts?)` | 팩토리 | 날짜 문자열 (strict 모드 설정 가능) |
| `isMimeType` | 상수 | MIME 타입 문자열 |
| `isCurrency(opts?)` | 팩토리 | 통화 문자열 |
| `isMagnetURI` | 상수 | Magnet URI |
| `isCreditCard` | 상수 | 신용카드 번호 (Luhn) |
| `isIBAN(opts?)` | 팩토리 | IBAN |
| `isByteLength(min, max?)` | 팩토리 | 바이트 길이 범위 |
| `isHash(algorithm)` | 팩토리 | 해시 문자열 (md4, md5, sha1, sha256, sha384, sha512 등) |
| `isRFC3339` | 상수 | RFC 3339 날짜시간 문자열 |
| `isMilitaryTime` | 상수 | 군사 시간 (HH:MM) |
| `isLatitude` | 상수 | 위도 문자열 |
| `isLongitude` | 상수 | 경도 문자열 |
| `isEthereumAddress` | 상수 | 이더리움 주소 |
| `isBtcAddress` | 상수 | 비트코인 주소 |
| `isISO4217CurrencyCode` | 상수 | ISO 4217 통화 코드 |
| `isPhoneNumber` | 상수 | E.164 국제 전화번호 |
| `isStrongPassword(opts?)` | 팩토리 | 강력한 비밀번호 (최소 길이, 대/소문자, 숫자, 특수문자 설정) |
| `isTaxId(locale)` | 팩토리 | 주어진 로케일의 세금 ID |

### 배열

| 규칙 | 설명 |
|---|---|
| `arrayContains(values)` | 주어진 요소를 모두 포함 |
| `arrayNotContains(values)` | 주어진 요소를 포함하지 않음 |
| `arrayMinSize(n)` | 배열 최소 길이 |
| `arrayMaxSize(n)` | 배열 최대 길이 |
| `arrayUnique()` | 중복 없음 |
| `arrayNotEmpty()` | 빈 배열이 아님 |

### 날짜

| 규칙 | 설명 |
|---|---|
| `minDate(date)` | 최소 날짜 |
| `maxDate(date)` | 최대 날짜 |

### 객체

| 규칙 | 설명 |
|---|---|
| `isNotEmptyObject(opts?)` | 최소 1개의 키 보유 (`{ nullable: true }` 옵션으로 null 값 키 무시) |
| `isInstance(Class)` | 주어진 클래스에 대한 `instanceof` 검사 |

### 로케일

로케일 문자열 매개변수를 받는 지역별 검증기입니다.

| 규칙 | 설명 |
|---|---|
| `isMobilePhone(locale)` | 주어진 로케일의 휴대전화 번호 (예: `'ko-KR'`, `'en-US'`, `'ja-JP'`) |
| `isPostalCode(locale)` | 주어진 로케일/국가 코드의 우편번호 (예: `'US'`, `'KR'`, `'GB'`) |
| `isIdentityCard(locale)` | 주어진 로케일의 주민등록번호/신분증 번호 (예: `'KR'`, `'US'`, `'CN'`) |
| `isPassportNumber(locale)` | 주어진 로케일의 여권 번호 (예: `'US'`, `'KR'`, `'GB'`) |

---

## 설정

첫 `deserialize()`/`serialize()`/`validate()` 호출 **이전에** `configure()`를 호출하세요:

```typescript
import { configure } from '@zipbul/baker';

configure({
  autoConvert: false,        // 암묵적 타입 변환 ("123" -> 123)
  allowClassDefaults: false, // 누락된 키에 클래스 기본값 사용
  stopAtFirstError: false,   // 첫 에러에서 중단 또는 전체 수집
  forbidUnknown: false,      // 미선언 필드 거부
  debug: false,              // 생성된 코드에 필드 제외 주석 포함
});
```

`configure()`는 `{ warnings: string[] }`을 반환합니다 — auto-seal 이후에 호출된 경우, 영향을 받지 않는 클래스를 알려주는 경고가 포함됩니다.

---

## 에러 처리

검증은 절대 throw하지 않습니다. `deserialize()`와 `validate()`는 성공 값 또는 `BakerErrors` 객체를 반환합니다. `isBakerError()` 타입 가드로 결과를 좁힙니다:

```typescript
import { deserialize, isBakerError } from '@zipbul/baker';

const result = await deserialize(CreateUserDto, input);

if (isBakerError(result)) {
  // result.errors: readonly BakerError[]
  for (const err of result.errors) {
    console.log(err.path, err.code, err.message);
  }
} else {
  // result: CreateUserDto
  console.log(result.name);
}
```

```typescript
interface BakerError {
  readonly path: string;      // 'user.address.city', 'items[0].value'
  readonly code: string;      // 'isString', 'min', 'isEmail', 'invalidInput', ...
  readonly message?: string;  // 커스텀 메시지 (@Field message 옵션 설정 시)
  readonly context?: unknown; // 커스텀 컨텍스트 (@Field context 옵션 설정 시)
}
```

> `SealError`는 Baker가 throw하는 유일한 예외입니다 — `@Field()` 데코레이터가 없는 클래스에 `deserialize()`를 호출하는 등의 프로그래밍 오류를 나타냅니다.

---

## 중첩 객체

`type` 옵션으로 중첩 DTO를 검증합니다:

```typescript
class AddressDto {
  @Field(isString)
  city!: string;
}

class UserDto {
  @Field({ type: () => AddressDto })
  address!: AddressDto;

  // 중첩 DTO 배열
  @Field({ type: () => [AddressDto] })
  addresses!: AddressDto[];
}
```

### Discriminator (다형성)

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

Discriminator는 양방향으로 동작합니다 — `deserialize()`는 프로퍼티 값으로 분기하고, `serialize()`는 `instanceof`로 분기합니다.

### Map / Set 컬렉션

Baker는 `Map`/`Set`과 JSON 호환 타입 간 자동 변환을 지원합니다:

```typescript
// Set<primitive>: JSON 배열 <-> Set
@Field({ type: () => Set })
tags!: Set<string>;

// Set<DTO>: JSON 객체 배열 <-> DTO 인스턴스 Set
@Field({ type: () => Set, setValue: () => TagDto })
tags!: Set<TagDto>;

// Map<string, primitive>: JSON 객체 <-> Map
@Field({ type: () => Map })
config!: Map<string, unknown>;

// Map<string, DTO>: JSON 객체 <-> DTO 인스턴스 Map
@Field({ type: () => Map, mapValue: () => PriceDto })
prices!: Map<string, PriceDto>;
```

Map 키는 항상 문자열입니다 (JSON 제약).

---

## 상속

Baker는 클래스 상속을 지원합니다. 자식 DTO는 부모 클래스의 모든 `@Field()` 데코레이터를 자동으로 상속합니다. 자식 클래스에서 필드를 오버라이드하거나 확장할 수 있습니다:

```typescript
class BaseDto {
  @Field(isString)
  name!: string;
}

class ExtendedDto extends BaseDto {
  @Field(isInt, min(0))
  age!: number;
  // `name`은 BaseDto에서 상속
}
```

---

## Transform

`FieldOptions`의 `transform` 옵션으로 역직렬화/직렬화 시 값을 변환할 수 있습니다. Transform 함수는 **비동기(async)**일 수 있습니다.

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

## 커스텀 규칙

```typescript
import { createRule } from '@zipbul/baker';

// 간단한 형태
const isEven = createRule('isEven', (v) => typeof v === 'number' && v % 2 === 0);

// 옵션 형태
const isPositiveInt = createRule({
  name: 'isPositiveInt',
  validate: (value) => Number.isInteger(value) && (value as number) > 0,
});

// 비동기 규칙
const isUnique = createRule({
  name: 'isUnique',
  validate: async (v) => await db.checkUnique(v),
});

class Dto {
  @Field(isPositiveInt)
  count!: number;
}
```

---

## 동작 원리

```
Decorators (@Field)     auto-seal (첫 호출)       deserialize() / serialize()
   메타데이터          ->   new Function() 코드생성  ->   생성된 코드 실행
```

1. `@Field()`가 정의 시점에 클래스 프로퍼티에 검증 메타데이터를 부착합니다
2. 첫 `deserialize()`/`serialize()`/`validate()` 호출이 **auto-seal**을 트리거합니다 — 모든 메타데이터를 읽고, 순환 참조를 분석하고, `new Function()`으로 최적화된 JavaScript 함수를 생성합니다
3. 이후 호출은 생성된 함수를 직접 실행합니다 — 해석 루프 없음

---

## 서브패스 익스포트

| 임포트 경로 | 용도 |
|---|---|
| `@zipbul/baker` | 메인 API: `deserialize`, `serialize`, `validate`, `configure`, `Field`, `arrayOf`, `createRule`, `isBakerError` |
| `@zipbul/baker/rules` | 규칙 함수 및 상수: `isString`, `min()`, `isEmail()`, `arrayOf()` 등 |

---

## 성능

seal 시점 인라인 코드 생성 — 런타임 해석 오버헤드 없음.

| 시나리오 | Baker | class-validator | zod |
|----------|------:|----------------:|----:|
| Valid (5 fields) | 39ns | 8.47us | 879ns |
| Invalid (5 fields) | 93ns | 10.68us | 8.57us |

---

## 라이선스

[MIT](./LICENSE)
