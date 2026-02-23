<p align="center">
  <h1 align="center">@zipbul/baker</h1>
  <p align="center">
    <strong>데코레이터 기반 validate + transform — 인라인 코드 생성</strong>
  </p>
  <p align="center">
    class-validator DX · AOT급 성능 · reflect-metadata 불필요
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

## 🤔 왜 Baker인가?

| | class-validator | Zod | TypeBox | **Baker** |
|---|---|---|---|---|
| 스키마 방식 | 데코레이터 | 함수 체이닝 | JSON Schema 빌더 | **데코레이터** |
| 성능 | 런타임 인터프리터 | 런타임 인터프리터 | JIT 컴파일 | **`new Function()` 인라인 코드생성** |
| Transform 내장 | 별도 패키지 | `.transform()` | ✗ | **통합** |
| reflect-metadata | 필수 | N/A | N/A | **불필요** |
| class-validator 마이그레이션 | — | 전면 재작성 | 전면 재작성 | **거의 그대로** |

Baker는 class-validator의 **익숙한 데코레이터 DX**를 유지하면서, `seal()` 시점에 `new Function()`으로 최적화된 검증+변환 함수를 생성합니다. **컴파일러 플러그인 없이 AOT 수준의 성능**을 제공합니다.

---

## ✨ 주요 기능

- 🎯 **데코레이터 우선** — `@IsString()`, `@Min()`, `@IsEmail()` 등 80개 이상의 내장 검증기
- ⚡ **인라인 코드 생성** — `seal()`이 검증기를 최적화된 함수로 컴파일, 런타임 해석 없음
- 🔄 **검증 + 변환 통합** — `deserialize()`와 `serialize()`를 하나의 async 호출로
- 🪶 **reflect-metadata 불필요** — `reflect-metadata` import 없이 동작
- 🔁 **순환 참조 감지** — seal 시점에 자동 정적 분석
- 🏷️ **그룹 기반 검증** — `groups` 옵션으로 요청별 다른 규칙 적용
- 🧩 **커스텀 규칙** — `createRule()`로 코드생성을 지원하는 사용자 정의 검증기 작성
- 🚀 **AOT 모드** — zipbul CLI로 빌드 시점에 코드 생성, 런타임 `seal()` 비용 제거

---

## 📦 설치

```bash
bun add @zipbul/baker
```

> **요구사항:** Bun ≥ 1.0, tsconfig.json에 `experimentalDecorators: true` 설정

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

---

## 🚀 빠른 시작

### 1. DTO 정의

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

### 2. 앱 시작 시 seal()

```typescript
import { seal } from '@zipbul/baker';

// 등록된 모든 DTO를 최적화된 검증 함수로 컴파일
seal();
```

### 3. 요청마다 deserialize()

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

### 4. serialize()

```typescript
import { serialize } from '@zipbul/baker';

const plain = await serialize(userInstance);
// plain: Record<string, unknown>
```

---

## 🏗️ 데코레이터

### 타입 검사

| 데코레이터 | 설명 |
|---|---|
| `@IsString()` | `typeof === 'string'` |
| `@IsNumber(opts?)` | `typeof === 'number'` + NaN/Infinity 검사 |
| `@IsInt()` | 정수 검사 |
| `@IsBoolean()` | `typeof === 'boolean'` |
| `@IsDate()` | `instanceof Date && !isNaN` |
| `@IsEnum(enumObj)` | 열거형 값 검사 |
| `@IsArray()` | `Array.isArray()` |
| `@IsObject()` | `typeof === 'object'`, null/Array 제외 |

### 공통

| 데코레이터 | 설명 |
|---|---|
| `@IsDefined()` | `!== undefined && !== null` |
| `@IsOptional()` | 값이 없으면 이후 규칙 건너뜀 |
| `@IsNotEmpty()` | `!== undefined && !== null && !== ''` |
| `@IsEmpty()` | `=== undefined \|\| === null \|\| === ''` |
| `@Equals(val)` | `=== val` |
| `@NotEquals(val)` | `!== val` |
| `@IsIn(values)` | 주어진 배열에 포함 |
| `@IsNotIn(values)` | 주어진 배열에 미포함 |
| `@ValidateNested()` | 중첩 DTO 검증 |
| `@ValidateIf(fn)` | 조건부 검증 |

### 숫자

| 데코레이터 | 설명 |
|---|---|
| `@Min(n)` | `value >= n` |
| `@Max(n)` | `value <= n` |
| `@IsPositive()` | `value > 0` |
| `@IsNegative()` | `value < 0` |
| `@IsInRange(min, max)` | `min <= value <= max` |
| `@IsDivisibleBy(n)` | `value % n === 0` |

### 문자열

<details>
<summary>50개 이상의 문자열 검증기 — 클릭하여 펼치기</summary>

| 데코레이터 | 설명 |
|---|---|
| `@MinLength(n)` | 최소 길이 |
| `@MaxLength(n)` | 최대 길이 |
| `@Length(min, max)` | 길이 범위 |
| `@Contains(seed)` | 부분 문자열 포함 |
| `@NotContains(seed)` | 부분 문자열 미포함 |
| `@Matches(pattern)` | 정규식 매치 |
| `@IsAlpha()` | 알파벳만 |
| `@IsAlphanumeric()` | 알파벳/숫자만 |
| `@IsNumeric()` | 숫자 문자열 |
| `@IsEmail(opts?)` | 이메일 형식 |
| `@IsURL(opts?)` | URL 형식 |
| `@IsUUID(version?)` | UUID v1–v5 |
| `@IsIP(version?)` | IPv4 / IPv6 |
| `@IsMACAddress()` | MAC 주소 |
| `@IsISBN(version?)` | ISBN-10 / ISBN-13 |
| `@IsISIN()` | ISIN |
| `@IsIBAN()` | IBAN |
| `@IsJSON()` | JSON 파싱 가능 문자열 |
| `@IsBase64()` | Base64 인코딩 |
| `@IsBase32()` | Base32 인코딩 |
| `@IsBase58()` | Base58 인코딩 |
| `@IsHexColor()` | 16진수 색상 코드 |
| `@IsHSL()` | HSL 색상 |
| `@IsRgbColor()` | RGB 색상 |
| `@IsHexadecimal()` | 16진수 문자열 |
| `@IsBIC()` | BIC/SWIFT 코드 |
| `@IsISRC()` | ISRC 코드 |
| `@IsEAN()` | EAN 바코드 |
| `@IsMimeType()` | MIME 타입 |
| `@IsMagnetURI()` | Magnet URI |
| `@IsCreditCard()` | 신용카드 번호 |
| `@IsHash(algorithm)` | 해시 (`md5 \| sha1 \| sha256 \| sha512` 등) |
| `@IsRFC3339()` | RFC 3339 날짜 |
| `@IsMilitaryTime()` | 24시간 형식 (`HH:MM`) |
| `@IsLatitude()` | 위도 (-90 ~ 90) |
| `@IsLongitude()` | 경도 (-180 ~ 180) |
| `@IsEthereumAddress()` | 이더리움 주소 |
| `@IsBtcAddress()` | 비트코인 주소 (P2PKH/P2SH/bech32) |
| `@IsISO4217CurrencyCode()` | ISO 4217 통화 코드 |
| `@IsPhoneNumber()` | E.164 국제 전화번호 |
| `@IsStrongPassword(opts?)` | 강력한 비밀번호 |
| `@IsSemVer()` | 시맨틱 버전 |
| `@IsISO8601()` | ISO 8601 날짜 문자열 |
| `@IsMongoId()` | MongoDB ObjectId |
| `@IsTaxId(locale)` | 국가별 납세자 번호 |

</details>

### 날짜

| 데코레이터 | 설명 |
|---|---|
| `@MinDate(date)` | 최소 날짜 |
| `@MaxDate(date)` | 최대 날짜 |

### 배열

| 데코레이터 | 설명 |
|---|---|
| `@ArrayContains(values)` | 주어진 요소를 모두 포함 |
| `@ArrayNotContains(values)` | 주어진 요소를 포함하지 않음 |
| `@ArrayMinSize(n)` | 배열 최소 길이 |
| `@ArrayMaxSize(n)` | 배열 최대 길이 |
| `@ArrayUnique()` | 중복 없음 |
| `@ArrayNotEmpty()` | 빈 배열이 아님 |

### 로케일

| 데코레이터 | 설명 |
|---|---|
| `@IsMobilePhone(locale)` | 국가별 이동전화 번호 |
| `@IsPostalCode(locale)` | 국가별 우편번호 |
| `@IsIdentityCard(locale)` | 국가별 신분증 번호 |
| `@IsPassportNumber(locale)` | 국가별 여권 번호 |

### Transform & Type

| 데코레이터 | 설명 |
|---|---|
| `@Transform(fn, opts?)` | 커스텀 변환 함수 |
| `@Type(fn)` | 중첩 DTO 타입 지정 + 암묵적 변환 |
| `@Expose(opts?)` | 프로퍼티 노출 제어 |
| `@Exclude(opts?)` | 직렬화에서 프로퍼티 제외 |

---

## ⚙️ Validation Options

모든 검증 데코레이터는 마지막 인자로 `ValidationOptions`를 받습니다:

```typescript
interface ValidationOptions {
  each?: boolean;        // 배열의 각 원소에 규칙 적용
  groups?: string[];     // 이 규칙이 속하는 그룹
  message?: string | ((args: {
    property: string;
    value: unknown;
    constraints: unknown[];
  }) => string);          // 커스텀 에러 메시지
  context?: unknown;     // 에러에 첨부할 임의 컨텍스트
}
```

**예시:**

```typescript
class UserDto {
  @IsString({ message: '이름은 문자열이어야 합니다' })
  name!: string;

  @IsInt({
    message: ({ property }) => `${property}는 정수여야 합니다`,
    context: { httpStatus: 400 },
  })
  age!: number;
}
```

---

## 🚨 에러 처리

검증 실패 시 `deserialize()`는 `BakerValidationError`를 throw합니다:

```typescript
class BakerValidationError extends Error {
  readonly errors: BakerError[];
  readonly className: string;
}
```

각 에러는 `BakerError` 인터페이스를 따릅니다:

```typescript
interface BakerError {
  readonly path: string;      // 필드 경로 ('user.address.city')
  readonly code: string;      // 에러 코드 ('isString', 'min', 'isEmail')
  readonly message?: string;  // 커스텀 메시지 (message 옵션 설정 시)
  readonly context?: unknown; // 커스텀 컨텍스트 (context 옵션 설정 시)
}
```

---

## 📋 배열 검증

`each: true` 옵션으로 Array, Set, Map의 각 원소에 규칙을 적용합니다:

```typescript
class TagsDto {
  @IsString({ each: true })
  tags!: string[];
}
```

---

## 🏷️ 그룹 기반 검증

용도에 따라 다른 규칙을 적용할 수 있습니다:

```typescript
class UserDto {
  @IsString({ groups: ['create'] })
  name!: string;

  @IsEmail({ groups: ['create', 'update'] })
  email!: string;
}

// 'create' 그룹의 규칙만 검증
const user = await deserialize(UserDto, body, { groups: ['create'] });
```

---

## 🪆 중첩 객체

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

## 🧩 커스텀 규칙

코드생성을 지원하는 사용자 정의 검증 규칙을 만들 수 있습니다:

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

## ⚙️ Seal 옵션

```typescript
seal({
  enableImplicitConversion: false, // 데코레이터 기반 자동 타입 변환
  enableCircularCheck: 'auto',     // 순환 참조 감지 ('auto' | true | false)
  exposeDefaultValues: false,      // 누락된 키에 클래스 기본값 사용
  stopAtFirstError: false,         // 첫 에러에서 중단 또는 전체 수집
  debug: false,                    // 생성된 소스를 검사용으로 저장
});
```

---

## 🔧 AOT 모드

**zipbul CLI**를 사용하면 빌드 시점에 검증 코드를 생성하여, 런타임 `seal()` 비용을 완전히 제거할 수 있습니다.

AOT 모드에서는 `/aot` 임포트(빈 스텁 데코레이터)를 사용합니다:

```typescript
import { IsString } from '@zipbul/baker/aot';
```

CLI가 빌드 단계에서 이 스텁들을 사전 생성된 검증 코드로 대체합니다.

---

## 📂 서브패스 익스포트

| 임포트 경로 | 용도 |
|---|---|
| `@zipbul/baker` | 메인 API: `seal`, `deserialize`, `serialize`, 모든 데코레이터 |
| `@zipbul/baker/decorators` | 데코레이터만 |
| `@zipbul/baker/aot` | AOT 모드용 빈 스텁 데코레이터 |
| `@zipbul/baker/rules` | 원시 규칙 객체 |
| `@zipbul/baker/symbols` | 내부 심볼 |

---

## 🔍 동작 원리

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  데코레이터   │ ──▶ │   seal()     │ ──▶ │ new Function() 코드  │
│  (메타데이터)  │     │  앱 시작 시  │     │   (인라인 코드생성)   │
└─────────────┘     └──────────────┘     └──────────┬──────────┘
                                                     │
                                          ┌──────────▼──────────┐
                                          │   deserialize() /   │
                                          │    serialize()      │
                                          │  (생성된 코드 실행)   │
                                          └─────────────────────┘
```

1. **데코레이터**가 클래스 프로퍼티에 검증 메타데이터를 부착합니다
2. **`seal()`**이 모든 메타데이터를 읽고, 순환 참조를 분석하고, `new Function()`으로 인라인 JavaScript 함수를 생성합니다
3. **`deserialize()` / `serialize()`**가 생성된 함수를 실행합니다 — 해석 루프 없이, 직선적인 최적화 코드만 실행

---

## 📄 라이선스

[MIT](./LICENSE) © [Junhyung Park](https://github.com/parkrevil)
