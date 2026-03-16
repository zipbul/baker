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
- **80개 이상의 내장 규칙** — `isString()`, `min()`, `isEmail()` 등을 인자로 조합
- **인라인 코드 생성** — 첫 `deserialize()`/`serialize()` 호출 시 auto-seal로 검증기를 컴파일
- **검증 + 변환 통합** — `deserialize()`와 `serialize()`를 하나의 async 호출로
- **reflect-metadata 불필요** — `reflect-metadata` import 없이 동작
- **순환 참조 감지** — seal 시점에 자동 정적 분석
- **그룹 기반 검증** — `groups` 옵션으로 요청별 다른 규칙 적용
- **커스텀 규칙** — `createRule()`로 코드생성을 지원하는 사용자 정의 검증기 작성
- **JSON Schema 출력** — `toJsonSchema()`로 DTO에서 JSON Schema Draft 2020-12 생성
- **다형성 discriminator** — `@Field({ discriminator })`로 유니온 타입 지원
- **Whitelist 모드** — `configure({ forbidUnknown: true })`로 미선언 필드 거부

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
  @Field(isString())
  name!: string;

  @Field(isInt(), min(0), max(120))
  age!: number;

  @Field(isEmail())
  email!: string;
}
```

### 2. Deserialize (첫 호출 시 auto-seal)

```typescript
import { deserialize, BakerValidationError } from '@zipbul/baker';

try {
  const user = await deserialize(CreateUserDto, requestBody);
  // user는 검증 완료된 CreateUserDto 인스턴스
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

> `seal()` 호출이 필요 없습니다 — baker는 첫 `deserialize()` 또는 `serialize()` 호출 시 등록된 모든 DTO를 자동으로 seal합니다.

---

## `@Field()` 데코레이터

`@Field()`는 모든 개별 데코레이터를 대체하는 단일 데코레이터입니다. 검증 규칙을 위치 인자로, 고급 기능은 옵션 객체로 전달합니다.

### 시그니처

```typescript
// 규칙만
@Field(isString(), minLength(3), maxLength(100))

// 옵션만
@Field({ optional: true, nullable: true })

// 규칙 + 옵션
@Field(isString(), { name: 'user_name', groups: ['create'] })

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
  optional?: boolean;                         // undefined 허용
  nullable?: boolean;                         // null 허용
  name?: string;                              // JSON 키 매핑 (양방향)
  deserializeName?: string;                   // 역직렬화 전용 키 매핑
  serializeName?: string;                     // 직렬화 전용 키 매핑
  exclude?: boolean | 'deserializeOnly' | 'serializeOnly';
  groups?: string[];                          // 가시성 + 조건부 검증
  when?: (obj: any) => boolean;               // 조건부 검증
  schema?: JsonSchemaOverride;                // JSON Schema 메타데이터
  transform?: (params: FieldTransformParams) => unknown;
  transformDirection?: 'deserializeOnly' | 'serializeOnly';
}
```

---

## 내장 규칙

모든 규칙은 `@zipbul/baker/rules`에서 import하며 `@Field()`의 인자로 전달합니다.

### 타입 검사

| 규칙 | 설명 |
|---|---|
| `isString()` | `typeof === 'string'` |
| `isNumber(opts?)` | `typeof === 'number'` + NaN/Infinity/maxDecimalPlaces 검사 |
| `isInt()` | 정수 검사 |
| `isBoolean()` | `typeof === 'boolean'` |
| `isDate()` | `instanceof Date && !isNaN` |
| `isEnum(enumObj)` | 열거형 값 검사 |
| `isArray()` | `Array.isArray()` |
| `isObject()` | `typeof === 'object'`, null/Array 제외 |

### 숫자

| 규칙 | 설명 |
|---|---|
| `min(n)` | `value >= n` (`{ exclusive: true }` 지원) |
| `max(n)` | `value <= n` (`{ exclusive: true }` 지원) |
| `isPositive` | `value > 0` |
| `isNegative` | `value < 0` |
| `isDivisibleBy(n)` | `value % n === 0` |

### 문자열

<details>
<summary>50개 이상의 문자열 검증기 — 클릭하여 펼치기</summary>

| 규칙 | 설명 |
|---|---|
| `minLength(n)` | 최소 길이 |
| `maxLength(n)` | 최대 길이 |
| `length(min, max)` | 길이 범위 |
| `contains(seed)` | 부분 문자열 포함 |
| `notContains(seed)` | 부분 문자열 미포함 |
| `matches(pattern)` | 정규식 매치 |
| `isAlpha()` | 알파벳만 |
| `isAlphanumeric()` | 알파벳/숫자만 |
| `isEmail(opts?)` | 이메일 형식 |
| `isURL(opts?)` | URL 형식 (포트 범위 검증) |
| `isUUID(version?)` | UUID v1-v5 |
| `isIP(version?)` | IPv4 / IPv6 |
| `isMACAddress()` | MAC 주소 |
| `isISBN(version?)` | ISBN-10 / ISBN-13 |
| `isJSON()` | JSON 파싱 가능 문자열 |
| `isBase64()` | Base64 인코딩 |
| `isCreditCard()` | 신용카드 번호 (Luhn) |
| `isISO8601()` | ISO 8601 날짜 문자열 |
| `isSemVer()` | 시맨틱 버전 |
| `isMongoId()` | MongoDB ObjectId |
| `isPhoneNumber()` | E.164 국제 전화번호 |
| `isStrongPassword(opts?)` | 강력한 비밀번호 |
| ... 그 외 30개 이상 | |

</details>

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

### 검증 옵션

모든 규칙은 `each`, `groups`, `message`, `context` 옵션을 인자로 받습니다:

```typescript
class UserDto {
  @Field(isString({ message: '이름은 문자열이어야 합니다' }))
  name!: string;

  @Field(isInt({ each: true, groups: ['admin'] }))
  scores!: number[];
}
```

---

## 설정

첫 `deserialize()`/`serialize()` 호출 **이전에** `configure()`를 호출하세요:

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

검증 실패 시 `deserialize()`는 `BakerValidationError`를 throw합니다:

```typescript
class BakerValidationError extends Error {
  readonly errors: BakerError[];
  readonly className: string;
}

interface BakerError {
  readonly path: string;      // 'user.address.city'
  readonly code: string;      // 'isString', 'min', 'isEmail'
  readonly message?: string;  // 커스텀 메시지
  readonly context?: unknown; // 커스텀 컨텍스트
}
```

---

## 중첩 객체

`type` 옵션으로 중첩 DTO를 검증합니다:

```typescript
class AddressDto {
  @Field(isString())
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

Discriminator는 양방향으로 동작합니다 — `deserialize()`는 프로퍼티 값으로 분기하고, `serialize()`는 `instanceof`로 분기합니다.

---

## 커스텀 규칙

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

DTO에서 JSON Schema Draft 2020-12를 생성합니다:

```typescript
import { toJsonSchema } from '@zipbul/baker';

const schema = toJsonSchema(CreateUserDto, {
  direction: 'deserialize',  // 'deserialize' | 'serialize'
  groups: ['create'],         // 그룹별 필터링
  onUnmappedRule: (name) => { /* 스키마 매핑이 없는 커스텀 규칙 */ },
});
```

---

## 동작 원리

```
Decorators (@Field)     auto-seal (첫 호출)       deserialize() / serialize()
   메타데이터          ->   new Function() 코드생성  ->   생성된 코드 실행
```

1. `@Field()`가 정의 시점에 클래스 프로퍼티에 검증 메타데이터를 부착합니다
2. 첫 `deserialize()`/`serialize()` 호출이 **auto-seal**을 트리거합니다 — 모든 메타데이터를 읽고, 순환 참조를 분석하고, `new Function()`으로 최적화된 JavaScript 함수를 생성합니다
3. 이후 호출은 생성된 함수를 직접 실행합니다 — 해석 루프 없음

---

## 서브패스 익스포트

| 임포트 경로 | 용도 |
|---|---|
| `@zipbul/baker` | 메인 API: `deserialize`, `serialize`, `configure`, `toJsonSchema`, `Field`, `createRule` |
| `@zipbul/baker/rules` | 규칙 함수: `isString()`, `min()`, `isEmail()` 등 |

---

## 라이선스

[MIT](./LICENSE)
