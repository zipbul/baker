# @zipbul/gildash 도입 분석 — baker에 대한 이점과 가능성

## Context

`@zipbul/gildash` (v0.7.0)는 Bun-native TypeScript 코드 인덱싱 & 의존성 그래프 엔진이다. baker는 AOT 아키텍처를 이미 설계해두었으나(`src/aot/` no-op 스텁), 실제 AOT 빌드 도구는 아직 없다. gildash는 이 누락된 퍼즐 조각이자, 그 이상의 가치를 제공할 수 있다.

---

## 아이디어 목록

### 1. AOT Pre-Compilation Pipeline (핵심)

baker의 `src/aot/` 스텁이 존재하는 이유 — 런타임 `seal()` 없이 빌드 타임에 코드를 생성하는 것.

**현재 런타임 흐름:**

```
데코레이터 → Class[RAW] 수집 → seal() → mergeInheritance → new Function() 코드젠 → Class[SEALED]
```

**gildash 기반 AOT 흐름:**

```
gildash 파싱 → 데코레이터 정적 추출 → RawClassMeta 재구성 → buildDeserializeCode/buildSerializeCode → 정적 .ts 파일 생성
```

**구체적 단계:**

| 단계 | 동작 | gildash API |
| --- | --- | --- |
| 1. DTO 탐색 | baker 데코레이터를 import하는 모든 클래스 탐지 | `searchRelations({ type: 'imports', dstFilePath: '@zipbul/baker/decorators' })` |
| 2. 데코레이터 추출 | 프로퍼티별 `@IsString()`, `@Min(5)`, `@Type(...)` 등 인자 파싱 | `findPattern('class $NAME { $$$ @IsString() $$$ }')` + `getFullSymbol()` |
| 3. 상속 해석 | `mergeInheritance()` 런타임 로직을 정적으로 선행 | `getHeritageChain(className, filePath)` |
| 4. 의존 그래프 | `@Type(() => X)` 참조 그래프 + 순환 탐지 | `getDependencies()`, `getCyclePaths()` |
| 5. Seal 순서 | 토폴로지 정렬로 코드젠 순서 결정 | `getTransitiveDependencies()` |
| 6. 코드 생성 | `RawClassMeta` → `buildDeserializeCode` / `buildSerializeCode` 호출 | baker 내부 빌더 함수 직접 사용 |
| 7. Import 리라이팅 | `@zipbul/baker/decorators` → `@zipbul/baker/aot` | `searchRelations({ type: 'imports' })` |
| 8. 증분 빌드 | 변경된 DTO만 재생성 | `diffSymbols()`, `getAffected()` |

**핵심 브릿지**: `src/types.ts`의 `RawClassMeta` / `RawPropertyMeta` 인터페이스. AOT 도구의 역할은 이 메타데이터를 정적 분석으로 재구성하는 것. 재구성 후 기존 `buildDeserializeCode()`에 그대로 전달 가능.

**`@Transform` 문제**: 임의 함수는 정적 추출 불가. 해결: (1) 인라인 화살표 함수는 코드 그대로 emit, (2) import된 함수는 `_refs[]` 패턴 유지, (3) 복잡한 경우 "partial AOT" 플래그.

- **Impact**: HIGH
- **Complexity**: HIGH

---

### 2. Build-Time DTO Linting

`seal()` 런타임에 발견되는 에러를 빌드 타임에 선행 탐지.

| 검사 항목 | 현재 | gildash 기반 |
| --- | --- | --- |
| `@Type` without `@ValidateNested` | `seal()` 시 `console.warn` | `findPattern()` 정적 탐지 |
| `@Expose` 충돌 | `validateExposeStacks()` SealError | 패턴 매칭 + 그룹 분석 |
| 금지 필드명 (`__proto__` 등) | `sealOne()` 시 SealError | `findPattern()` 즉시 탐지 |
| `@Exclude` + `@Expose` 동시 적용 | 미검사 | `findPattern()` 탐지 |
| 순환 DTO 참조 | `analyzeCircular()` 런타임 | `getCyclePaths()` 빌드 타임 |
| 타입 규칙 불일치 (`@MinLength` without `@IsString`) | 미검사 | 데코레이터 조합 분석 |
| Orphan DTO (선언만 되고 미사용) | 미검사 | `searchRelations` 역참조 |

- **Impact**: HIGH
- **Complexity**: MEDIUM

---

### 3. class-validator / class-transformer 마이그레이션 도구

baker 채택의 최대 장벽 = 기존 class-validator 코드 마이그레이션 비용. gildash로 자동화 가능.

**자동 변환 매핑:**

| class-validator/transformer | baker | 변환 방식 |
| --- | --- | --- |
| `import from 'class-validator'` | `import from '@zipbul/baker'` | `searchRelations` + 리라이팅 |
| `@Expose({ toClassOnly: true })` | `@Expose({ deserializeOnly: true })` | `findPattern()` |
| `@Expose({ toPlainOnly: true })` | `@Expose({ serializeOnly: true })` | `findPattern()` |
| `validate(instance)` | `deserialize(Class, input)` | `searchSymbols` + call site 변환 |
| `plainToInstance()` | `deserialize()` | `findPattern()` |
| `instanceToPlain()` | `serialize()` | `findPattern()` |

**추가**: `getAffected()`로 마이그레이션 범위 사전 산출, `getDependencies()`로 마이그레이션 순서 (리프 DTO부터) 결정.

- **Impact**: HIGH
- **Complexity**: MEDIUM

---

### 4. AOT Stub 동기화 검증

`src/decorators/`에 데코레이터 추가 시 `src/aot/`에 대응 스텁을 빠뜨리는 실수 방지.

```typescript
const runtime = g.getModuleInterface('src/decorators/index.ts');
const aot = g.getModuleInterface('src/aot/index.ts');
// diff → 누락/시그니처 불일치 즉시 탐지
```

→ CI에서 자동 검증. 누락 스텁 자동 생성도 가능 (모든 AOT 스텁은 `return noop` 패턴 동일).

- **Impact**: MEDIUM
- **Complexity**: LOW

---

### 5. DTO 의존성 시각화 & 영향 분석

```typescript
// DTO 참조 그래프
const graph = await g.getImportGraph();

// 변경 영향 범위
const affected = await g.getAffected(['src/dto/base.dto.ts']);
// → BaseDto를 상속하는 모든 DTO + 사용처

// 커플링 메트릭
const metrics = await g.getFanMetrics('src/dto/user.dto.ts');
// → { fanIn: 12, fanOut: 3 } — 리팩토링 우선순위 판단
```

PR 리뷰 시 "이 DTO 변경이 어디까지 영향 미치는지" 자동 코멘트 가능.

- **Impact**: MEDIUM
- **Complexity**: LOW

---

### 6. DTO 문서 자동 생성

데코레이터 → JSON Schema / OpenAPI / Markdown 자동 변환.

| 데코레이터 | JSON Schema |
| --- | --- |
| `@IsString()` | `{ "type": "string" }` |
| `@MinLength(5)` | `{ "minLength": 5 }` |
| `@IsEmail()` | `{ "format": "email" }` |
| `@IsOptional()` | `required` 배열에서 제외 |
| `@Type(() => X)` + `@ValidateNested()` | `{ "$ref": "#/definitions/X" }` |

gildash의 `getFullSymbol()` → JSDoc 포함, `getHeritageChain()` → 상속 관계 문서화.

- **Impact**: MEDIUM
- **Complexity**: MEDIUM

---

### 7. 런타임 최적화 힌트

빌드 타임 분석 결과를 `.baker-hints.json`에 저장, `seal()`이 읽어서 비용이 큰 분석을 스킵.

| 힌트 | seal() 절약 |
| --- | --- |
| async 여부 사전 계산 | `analyzeAsync()` 재귀 스킵 |
| 순환 참조 사전 마킹 | `analyzeCircular()` DFS 스킵 |
| 필드 수 추정 | 에러 배열 pre-allocation |

- **Impact**: MEDIUM
- **Complexity**: LOW

---

### 8. DTO 스키마 Diffing (API 버전 관리)

git 브랜치 간 DTO 변경을 자동 분류.

| 변경 유형 | 분류 |
| --- | --- |
| 필드 삭제 | BREAKING |
| `@IsOptional()` 없는 필드 추가 | BREAKING |
| `@Expose({ name })` 변경 | BREAKING |
| `@IsOptional()` 있는 필드 추가 | NON-BREAKING |
| 검증 완화 (`@MinLength(10)` → `@MinLength(5)`) | NON-BREAKING |
| 검증 강화 (`@MinLength(5)` → `@MinLength(10)`) | POTENTIALLY BREAKING |

`diffSymbols()` + 데코레이터 인자 비교로 구현.

- **Impact**: MEDIUM
- **Complexity**: MEDIUM

---

### 9. 테스트 자동 생성 & 커버리지 분석

데코레이터 메타데이터 기반으로 테스트 스캐폴드 자동 생성.

- `@IsString()` → 문자열(pass), 숫자(fail), null(fail) 테스트 케이스
- `@MinLength(5)` → `"abcde"`(pass), `"abcd"`(fail)
- `@ValidateNested()` + `@Type(() => X)` → valid nested(pass), invalid(fail), non-object(fail)

`searchRelations`로 테스트 파일 ↔ DTO 크로스레퍼런스 → 커버리지 갭 탐지.

- **Impact**: MEDIUM
- **Complexity**: MEDIUM

---

### 10. 증분 Seal (Incremental Hot Reload)

개발 중 변경된 DTO만 re-seal. gildash 파일 워처 + `diffSymbols()` + `getAffected()` 조합.

```
파일 변경: dto/address.dto.ts
→ diffSymbols: AddressDto.zipCode 변경
→ getAffected: [AddressDto, UserDto, OrderDto]
→ sealIncremental([AddressDto, UserDto, OrderDto])  // 3개만 re-seal
```

- **Impact**: MEDIUM
- **Complexity**: HIGH (seal() 부분 재실행 메커니즘 필요)

---

### 11. 플러그인 / 커스텀 Rule 자동 탐색

프로젝트 + node_modules에서 `createRule()` 호출을 자동 탐지. 이름 충돌 검사, 룰 카탈로그 자동 생성.

- **Impact**: LOW-MEDIUM
- **Complexity**: LOW

---

## 우선순위 요약

| 순위 | 아이디어 | Impact | Complexity | gildash 고유 가치 |
| --- | --- | --- | --- | --- |
| 1 | AOT Pre-Compilation | HIGH | HIGH | 상속 체인, 의존 그래프, 패턴 매칭, 증분 인덱싱 |
| 2 | Build-Time Linting | HIGH | MEDIUM | 패턴 매칭, 순환 탐지 |
| 3 | class-validator 마이그레이션 | HIGH | MEDIUM | import 관계, 패턴 매칭, 영향 분석 |
| 4 | AOT Stub 동기화 검증 | MEDIUM | LOW | 모듈 인터페이스 비교 |
| 5 | 의존성 시각화 & 영향 분석 | MEDIUM | LOW | 의존 그래프, fan 메트릭 |
| 6 | DTO 문서 자동 생성 | MEDIUM | MEDIUM | 심볼 상세, 상속 체인 |
| 7 | 런타임 최적화 힌트 | MEDIUM | LOW | 사전 계산 캐싱 |
| 8 | 스키마 Diffing | MEDIUM | MEDIUM | 심볼 diff |
| 9 | 테스트 자동 생성 | MEDIUM | MEDIUM | 크로스레퍼런스 |
| 10 | 증분 Seal | MEDIUM | HIGH | 파일 워처, diff, affected |
| 11 | 플러그인 탐색 | LOW-MEDIUM | LOW | 심볼 검색 |

## 권장 도입 순서

**Phase 0 (Foundation)**: DTO 탐색 인프라 — gildash로 baker DTO 클래스를 찾아 `RawClassMeta` 형태로 재구성하는 공통 기반. 아이디어 1, 2, 3, 6, 9의 공유 인프라.

**Phase 1 (Quick Wins)**: #4 AOT Stub 동기화 + #5 의존성 시각화 + #2 Linting — 즉시 CI 가치. 복잡도 낮음.

**Phase 2 (Core Value)**: #1 AOT 파이프라인 + #3 마이그레이션 도구 — baker의 핵심 차별점.

**Phase 3 (Polish)**: #6 문서 + #7 최적화 + #8 스키마 Diffing + #9 테스트.
