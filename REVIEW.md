# Baker 심층 리뷰 — 수정 계획

> 리뷰 일자: 2026-03-16 (검증 보완: 2026-03-16)
> 대상: @zipbul/baker 0.1.2
> 테스트 현황: 1641 pass / 0 fail (커버리지 ~98%+, 그러나 깊이 부족)

---

## 실행 우선순위

모든 항목에 우선순위 태그를 부여한다. 수정 순서는 다음과 같다.

| 단계 | 우선순위 | 대상 항목 | 진행 | 기준 |
|------|----------|-----------|------|------|
| **1단계: 즉시** | 🔴 Critical | C-1, C-2, C-5, C-7, C-8, C-9 | 6/6 | 런타임에 잘못된 결과를 반환하거나 기능 손실을 유발하는 실제 버그 |
| **2단계: 곧** | 🟠 High | C-3, C-6, C-10, C-11, C-12, B-6, B-1, B-3, B-7, B-9 | 10/10 | 스펙 위반, 안전장치 누락, 잠재적 크래시, API 의미 불일치 |
| **3단계: 안정화** | 🟡 Medium | B-2, B-4, B-8, B-11, C-13, C-14, C-15, D-1, D-4 | 9/9 | Silent failure 제거 + 버그 원인이 된 코드 중복 제거 |
| **4단계: 개선** | 🟢 Low | A-1, B-10, D-2, D-3, D-5, D-6, F-1~F-7, B-5, C-16, C-17 | 17/17 | 설계 개선, 리팩토링, 코드 품질 |

> **Breaking change 포함 항목**: A-1 (SealOptions 필드 삭제), B-10 (throw 전환 — 대안 검토 필요).
> 이들은 다음 major 버전(0.2.0)에 묶어서 릴리스하되, CHANGELOG에 마이그레이션 가이드를 포함한다.
> Deprecation 전략: 0.1.x에서 `enableCircularCheck` 사용 시 `console.warn('[baker] enableCircularCheck is deprecated and will be removed in 0.2.0')` 경고를 추가한 후, 0.2.0에서 삭제.

---

## A. 설계 결함

### [x] A-1. `enableCircularCheck` 옵션 제거 `🟢 Low` `⚠️ Breaking`

**현황**: `SealOptions.enableCircularCheck`가 `boolean | 'auto'` 타입으로 존재.
순환 참조 감지는 선택이 아닌 필수 안전장치. 사용자가 끌 수 있으면 안 됨.

> **참고**: `BakerConfig`(공개 API)에는 이 옵션이 노출되지 않으며, `SealOptions`(내부)에만 존재한다.
> 따라서 외부 사용자가 직접 `false`로 설정할 경로는 제한적이나, 내부적으로 `_globalOptions`에 `enableCircularCheck: 'auto'`가 하드코딩되어 있어 코드 복잡도를 올리고 있다.

**수정 계획**:
1. **0.1.x (deprecation)**: `enableCircularCheck`에 값이 명시적으로 전달되면 `console.warn` 발행
2. **0.2.0 (제거)**:
   - `src/interfaces.ts` — `SealOptions`에서 `enableCircularCheck` 프로퍼티 삭제
   - `src/configure.ts:31` — 하드코딩된 `enableCircularCheck: 'auto'` 제거
   - `src/seal/circular-analyzer.ts` — `options?.enableCircularCheck` 분기 제거, 무조건 분석 실행
   - `src/seal/seal.ts:190` — `analyzeCircular` 호출에서 options 전달 제거
   - `test/e2e/circular-check.test.ts` — `enableCircularCheck: false` 관련 테스트를 "항상 감지" 테스트로 교체

---

## B. 침묵하는 에러 (Silent Failures)

원칙: **모든 문제는 겉으로 드러나야 한다. 침묵은 명시적 확인 후에만 허용.**

### [x] B-1. `deserialize-builder.ts:499-503` — type fn() 에러 완전 삼킴 `🟠 High`

**현황**:
```typescript
try {
  const raw = meta.type.fn();
  // ...
} catch { /* ignore lazy eval failures */ }
```
`@Field({ type: () => BrokenClass })` 함수가 throw하면 완전히 무시.
변환 최적화가 빠지는데 개발자가 모름.

> **배경**: 이 코드 경로는 `enableConversion` + `@Type` hint가 있고 typed validation rule이 없을 때만 도달한다. `sealOne()` (seal.ts:170-175)에서 이미 `meta.type.fn()`을 호출하여 검증하므로, 정상 흐름에서는 여기서 throw가 발생하지 않는다. 그러나 "이론적으로 불가능하니 삼키자"는 방어적 코딩은 미래 리팩토링 시 버그를 숨길 위험이 있다.

**수정 계획**:
- catch 블록에서 `SealError` throw — 클래스명, 필드명, 원본 에러 메시지 포함
- `throw new SealError(\`${Class.name}.${fieldKey}: @Field type function threw: ${(e as Error).message}\`)`

### [x] B-2. `to-json-schema.ts:381-386` — 미매핑 룰 조용히 누락 `🟡 Medium`

**위치**: `src/functions/to-json-schema.ts:381-386`

**현황**:
```typescript
const mapper = RULE_SCHEMA_MAP[rd.rule.ruleName];
if (!mapper) continue; // 조용히 스킵
```
`createRule()`로 만든 커스텀 룰이 JSON Schema에서 사라짐.

> **참고**: 바로 아래 `if (!result) continue;` (line 384)는 mapper가 null을 반환하는 의도적 케이스(예: `isIP`에 version 미지정)이므로 별개의 문제다.

**수정 계획**:
- `ToJsonSchemaOptions`에 `onUnmappedRule?: (ruleName: string, fieldKey: string) => void` 콜백 추가
- 기본 동작: `console.warn(\`[baker] No JSON Schema mapping for rule "${ruleName}" on field "${fieldKey}"\`)`
- `warnOnce` 패턴으로 동일 룰 반복 경고 방지

### [x] B-3. `deserialize-builder.ts:414-416` — 미지원 변환 타입 침묵 `🟠 High`

**현황**:
```typescript
switch (targetType) {
  case 'string': ...
  case 'number': ...
  default: return ''; // 빈 문자열 → 필드 할당 사라짐
}
```

> **참고**: `effectiveGateType`은 `PRIMITIVE_TYPE_HINTS` (→ `'number' | 'boolean' | 'string' | 'date'`)와 `ASSERTER_TO_GATE` (동일 4가지)에서만 파생되므로, 현재 코드에서 `default` 케이스는 **도달 불가능**하다. 그럼에도 방어적 throw가 올바른 이유: 향후 타입 추가 시 switch 누락을 즉시 감지할 수 있다.

**수정 계획**:
- `default` 케이스에서 `throw new SealError(\`Unknown implicit conversion type: "${targetType}" for field "${fieldKey}"\`)`
- 이 함수는 seal 타임에 호출되므로 런타임 비용 없음

### [x] B-4. `field.ts:228-229` — `transformDirection` 검증 없음 `🟡 Medium`

**현황**: `options.transformDirection`에 오타(`'serializeOnl'`)를 넣으면 양방향으로 적용됨.
TypeScript 리터럴 유니온(`'deserializeOnly' | 'serializeOnly'`)이 정적 가드 역할을 하지만, JS 호출자나 `as any` 우회 시 런타임에서 잡히지 않는다.

> **시점**: `@Field` 데코레이터는 모듈 로드(클래스 정의) 시 실행되므로, 런타임 throw가 즉시 표면화된다.

**수정 계획**:
- 런타임 검증 추가:
  ```typescript
  if (options.transformDirection && options.transformDirection !== 'deserializeOnly' && options.transformDirection !== 'serializeOnly') {
    throw new Error(`Invalid transformDirection: "${options.transformDirection}". Expected 'deserializeOnly' or 'serializeOnly'.`);
  }
  ```

### [x] B-5. `deserialize-builder.ts:181,187` — 생성된 코드에서 필드 스킵 사유 불투명 `🟢 Low`

**현황**: exclude/expose 조건으로 필드가 빠질 때 `return ''`을 반환한다.

> **정정**: 소스 코드 자체에는 인라인 주석이 이미 존재한다 (`// deserializeOnly or both → skip deserialize` 등). 문제는 소스 코드가 아니라, **생성된 JS 함수 본문**에 스킵 사유가 남지 않아 디버깅 시 어떤 필드가 왜 빠졌는지 추적이 어렵다는 것이다.

**수정 계획**:
- 생성된 코드에 주석 삽입: `code += \`// [baker] field "${fieldKey}" excluded (${reason})\n\``
- 디버그 모드(`configure({ debug: true })`) 활성화 시에만 삽입하여 프로덕션 코드 크기 영향 최소화

### [x] B-6. `constructor?.name === 'AsyncFunction'` — 취약한 async 감지 `🟠 High`

**현황**: 5개소에서 사용:
1. `create-rule.ts:43`
2. `field.ts:213`
3. `seal.ts:27`
4. `deserialize-builder.ts:296`
5. `serialize-builder.ts:190`

minification 시 `constructor.name`이 변경되어 async 함수가 sync로 오분류. Bun bundler는 production build에서 기본적으로 name을 mangle한다. baker는 라이브러리이지만, 사용자가 앱 전체를 번들링하면 이 코드가 영향받는다.

**수정 계획**:
- 프로토타입 비교 방식으로 교체:
  ```typescript
  const AsyncFunctionProto = Object.getPrototypeOf(async function() {});
  function isAsyncFunction(fn: Function): boolean {
    return Object.getPrototypeOf(fn) === AsyncFunctionProto;
  }
  ```
- 이 유틸을 `src/utils.ts` (신규)에 배치, 모든 5개 사용처에서 import
- `createRule()`에 명시적 `isAsync` 옵션 추가 (자동감지 실패 시 수동 지정 가능)

### [x] B-7. `circular-analyzer.ts:34-38` — `meta.type.fn()` try-catch 없음 `🟠 High`

**현황**: lazy type 함수가 throw하면 전체 순환 분석이 크래시.

> **배경**: `sealOne()` (seal.ts:170-175)에서 이미 `meta.type.fn()`을 호출/검증한 후에 `analyzeCircular`가 호출되므로, 정상 흐름에서는 여기서 throw가 발생하지 않는다. 그러나 `analyzeCircular`는 export된 함수이므로 독립 호출될 수 있으며, 방어적 에러 처리가 필요하다.

**수정 계획**:
- try-catch 래핑, 실패 시 `SealError` throw — 어떤 클래스의 어떤 필드에서 실패했는지 포함
- B-1과 달리 **에러를 삼키지 않고 드러내는** 패턴:
  ```typescript
  try {
    const typeResult = meta.type.fn();
    // ...
  } catch (e) {
    throw new SealError(`${Class.name}.${fieldKey}: type function threw: ${(e as Error).message}`);
  }
  ```

### [x] B-8. `collect.ts:73-77` — schema merge 배열 입력 미차단 `🟡 Medium`

**현황**: `schemaDef`에 배열이 전달되면 spread로 `{0: x, 1: y}` 형태의 무의미한 스키마가 생성된다.

> **정정**: TypeScript 시그니처가 `Record<string, unknown> | Function`으로 정적 가드를 제공하므로, TS 사용자는 보호된다. 실제 위험은 JS 호출자 또는 `as any` 우회 시 배열이 전달되는 경우다. `collectSchema`는 `@internal` 함수이므로 위험도가 낮지만, 방어 코딩이 바람직하다.

**수정 계획**:
- 최소한의 가드 추가 (전체 타입 검증은 과도):
  ```typescript
  if (Array.isArray(schemaDef)) {
    throw new Error(`Invalid schema: expected object or function, got Array`);
  }
  ```

### [x] B-9. `seal.ts:142-143` — seal 에러에 클래스명 없음 `🟠 High`

**현황**: `throw new SealError('seal in progress')` — 어떤 클래스인지 모름.

> **참고**: 이 에러는 seal 진행 중에 동일 클래스의 `_deserialize`/`_serialize`가 호출될 때만 발생하며, 정상적으로는 도달 불가능하다. 그러나 에러 메시지가 무의미하면 seal 로직 버그 디버깅이 불가능해진다.

**수정 계획**:
- `_sealInProgressThrow` 싱글톤 대신 클래스별 closure 생성:
  ```typescript
  const placeholder: SealedExecutors<unknown> = {
    _deserialize: () => { throw new SealError(`Circular dependency during seal: ${Class.name} is still being sealed`); },
    _serialize: () => { throw new SealError(`Circular dependency during seal: ${Class.name} is still being sealed`); },
    // ...
  };
  ```

### [x] B-10. `configure.ts:27` — seal 후 configure() 호출 처리 `🟢 Low` `⚠️ Breaking`

**현황**: seal 후 configure 호출 시 `console.warn`만 출력. 테스트 불가, 프로덕션에서 묻힘.

> **논쟁점**: 단순히 `throw`로 변경하면 동적 import 시나리오가 깨진다. 일부 클래스만 seal된 상태에서 configure를 호출하면, 아직 seal되지 않은 클래스에는 새 설정이 적용되어야 한다. 또한 `SealError` 타입은 의미적으로 부적절하다 — `configure()`는 seal 작업이 아니다.

**수정 계획 (3가지 대안 중 택 1)**:

1. **대안 A — 구조화된 경고 + 테스트 가능**: configure가 반환값으로 `{ warnings: string[] }`을 돌려주고, seal 후 호출 시 warning을 포함. 기존 동작 유지하면서 테스트 가능.
2. **대안 B — strict 모드 옵션**: `configure({ strict: true })`일 때만 `throw new Error(...)`. 기본값은 warn 유지.
3. **대안 C — 무조건 throw** (원안): `throw new Error('configure() must be called before the first deserialize/serialize.')`. 가장 단순하지만 breaking change.

**권장**: 대안 A — 비파괴적이면서 테스트 가능. 대안 C를 선택할 경우 0.2.0에 포함.

### [x] B-11. `to-json-schema.ts:392-394` — `applyNullable` null 중복 추가 `🟡 Medium`

**위치**: `src/functions/to-json-schema.ts:390-398`

**현황**:
```typescript
schema.type = Array.isArray(schema.type)
  ? [...schema.type, 'null']  // 이미 'null'이면 중복
  : [schema.type, 'null'];
```

> **참고**: 현재 코드에서 `applyNullable`이 동일 스키마에 2회 호출되는 경로는 없다. 이 버그는 **잠재적(latent)** 상태이며, 향후 리팩토링 시 회귀 위험이 있다. 수정은 미래 방어용이다.

**수정 계획**:
```typescript
if (Array.isArray(schema.type)) {
  if (!schema.type.includes('null')) schema.type = [...schema.type, 'null'];
} else {
  schema.type = schema.type === 'null' ? ['null'] : [schema.type, 'null'];
}
```

---

## C. 확인된 버그

### [x] C-1. `seal.ts:38-47` — `analyzeAsync` discriminator visited Set 미공유 `🔴 Critical`

**현황**:
```typescript
// line 41: discriminator subTypes — for 루프 안에서 매 iteration마다 새 Set 생성
for (const sub of meta.type.discriminator.subTypes) {
  const v = visited ?? new Set<Function>(); // ← 새로운 Set!
  if (!v.has(sub.value)) {
    v.add(sub.value);
    if (analyzeAsync(sub.value as Function, v)) return true;
  }
}
```
`visited`가 undefined로 진입하면 매 iteration마다 새 `Set`이 생성된다. Sub-A에서 `v.add(sub.value)`를 해도 Sub-B iteration에서는 새 Set이 만들어져 Sub-A가 보이지 않는다 → 순환 참조 감지 실패 → 무한 재귀 가능.

**수정 계획**:
- 함수 진입부에서 한 번만 초기화:
  ```typescript
  function analyzeAsync(Class: Function, visited?: Set<Function>): boolean {
    const v = visited ?? new Set<Function>();
    // 이후 모든 재귀 호출에 v 전달
  }
  ```

### [x] C-2. `deserialize-builder.ts:666,672` — Set/Map stopAtFirstError 에러 경로 인덱스 누락 `🔴 Critical`

> **근본 원인**: 이 버그는 D-4(Array/Set/Map each 코드 중복)에서 직접 파생되었다. collectErrors 경로에서는 `siVar`/`miVar` 카운터가 올바르게 선언·사용되지만, stopAtFirstError 경로를 별도로 복제하면서 카운터 변수 선언과 인덱스 포함이 누락되었다. D-4 리팩토링을 함께 수행하면 동일 템플릿에서 양쪽 경로가 생성되므로 이런 불일치가 구조적으로 불가능해진다.

**현황**:
```typescript
// collectErrors 경로 (정상):
var __bk$si_0 = 0;
for (var __bk$sv_0 of value) {
  // path: fieldKey + '[' + __bk$si_0 + ']'
  __bk$si_0++;
}

// stopAtFirstError 경로 (버그):
for (var __bk$sv_0 of value) {
  // path: fieldKey  ← 인덱스 없음, 카운터 변수도 미선언
}
```

**수정 계획**:
- Set: 인덱스 카운터 변수 `var ${siVar}=0` 선언 + 루프 끝에 `${siVar}++` + path에 `+'['+${siVar}+']'` 추가
- Map: 동일하게 `var ${miVar}=0` 선언 + `${miVar}++` + path에 `+'['+${miVar}+']'` 추가
- **권장**: D-4 리팩토링과 동시 수행하여 근본 원인 제거

### [x] C-3. `to-json-schema.ts:326-337` — discriminator JSON Schema 구조 위반 `🟠 High`

**위치**: `src/functions/to-json-schema.ts:329-335` (~~`src/seal/to-json-schema.ts`~~ 경로 정정)

**현황**:
```typescript
const ref = processNestedClass(sub.value as Function, ctx);
return {
  ...ref,                                          // { $ref: '#/$defs/Dog' }
  properties: { [property]: { const: sub.name } }, // $ref 옆에 sibling → 스펙 위반
  required: [property],
};
```
JSON Schema 2020-12 (및 Draft 7 strict 모드)에서 `$ref`와 `properties`가 같은 레벨에 있으면 `$ref`만 처리되고 나머지는 무시된다.

**수정 계획**:
```typescript
const ref = processNestedClass(sub.value as Function, ctx); // 기존 호출 유지 — ctx.defs에 등록 필수
return {
  allOf: [
    ref,  // { $ref: '#/$defs/Dog' } — processNestedClass 반환값 그대로 사용
    { properties: { [property]: { const: sub.name } }, required: [property] },
  ],
};
```

> **주의**: `processNestedClass` 호출을 생략하고 `defKey`를 직접 구성하면 nested class가 `ctx.defs`에 등록되지 않아 `$ref` 해석이 깨진다.

**수정해야 할 기존 테스트** (C-3 버그를 정답으로 assert하는 테스트 3건):
1. `test/e2e/discriminator-advanced.test.ts:101-105` — `oneOf![0]`이 flat `$ref`+`properties` 형태를 expect
2. `test/e2e/nested-decorator.test.ts:134-142` — `oneOf![0]`, `oneOf![1]` 모두 flat 형태를 expect
3. `src/functions/to-json-schema.spec.ts:562-572` — unit spec에서 동일한 flat 구조를 expect

세 곳 모두 `allOf` 래핑 구조로 expect 값을 수정해야 한다.

### [x] C-4. `rules/string.ts:267` — `isVariableWidth` emit 빈 문자열 가드 불일치 `🟢 Low` `스타일`

**현황**: `isFullWidth`/`isHalfWidth`는 runtime과 emit 모두에서 `v.length === 0` 명시적 체크를 포함하지만, `isVariableWidth`는 누락.

> **정정**: 이것은 **실제 버그가 아니다**. `isVariableWidth`의 두 정규식(`FULLWIDTH_RE`, `HALFWIDTH_RE`)이 빈 문자열에 match하지 않으므로, `v.length === 0` 가드 없이도 빈 문자열은 올바르게 fail한다. runtime과 emit의 결과가 일치하며 동작상 문제가 없다.
>
> 수정은 형제 룰(`isFullWidth`/`isHalfWidth`)과의 **스타일 일관성** 목적이다.

**수정 계획**:
- emit 코드에 `if (${varName}.length === 0) ${ctx.fail('isVariableWidth')};` 추가
- runtime에도 `v.length === 0` 시 `false` 반환 추가
- 우선순위: 낮음 — 기능 정확성에 영향 없음

### [x] C-5. `rules/number.ts:84` — `isDivisibleBy(0)` 침묵 실패 `🔴 Critical`

**현황**:
- runtime: `(value as number) % 0` → `NaN` → `NaN === 0`은 `false` → **모든 값이 검증 실패**
- emit: `if (${varName} % 0 !== 0)` → `NaN !== 0`은 `true` → **모든 값이 검증 실패**

두 경로 모두 무조건 실패하지만 에러 메시지가 "divisor가 0이라서"가 아닌 "isDivisibleBy 위반"으로 나와 원인 파악 불가.

**수정 계획**:
- 팩토리 함수 진입부에서 `if (n === 0) throw new Error('isDivisibleBy: divisor must not be zero')`
- seal 타임에 에러 발생하므로 런타임 비용 없음

### [x] C-6. `rules/string.ts:381` — `isURL` 포트 65536-99999 허용 `🟠 High`

**현황**: 정규식 `(?::\d{1,5})?`가 5자리 숫자를 모두 허용. TCP 유효 포트는 0-65535.

**수정 계획**:
- `isPort`(line 811)와 동일한 포트 정규식 사용:
  `(?::(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}|0))?`
- 또는 정규식에서 `\d{1,5}`를 유지하고 포트 범위를 런타임 검증에 위임 (정규식 복잡도 증가를 피하려면)

### [x] C-7. `rules/typechecker.ts:40` — `isNumber maxDecimalPlaces` 과학 표기법 파싱 오류 `🔴 Critical`

**현황**:
- runtime (line 39-43): `value.toString()` → `indexOf('.')` — `(1e-7).toString()` = `"1e-7"` → `indexOf('.') = -1` → 소수점 체크 **우회**
- emit (line 56-58): 동일한 `toString()` + `indexOf('.')` 패턴 → **동일 버그**
- 영향: `isNumber({ maxDecimalPlaces: 2 })(1e-10)` → `true` (10자리 소수인데 통과)

**수정 계획**:
- ~~`Math.pow(10, maxDecimalPlaces)` 곱셈 + `Number.EPSILON` 비교 방식~~은 **부적합**:
  - `Number.EPSILON`은 고정 상수(2.22e-16)이지만, 부동소수점 오차는 값의 크기에 비례
  - `99999999999.99 * 100`의 오차가 `Number.EPSILON`보다 훨씬 커서 유효한 값이 거부됨
  - `0.1 + 0.2 = 0.30000000000000004`도 오차가 `Number.EPSILON`의 20배라 거부됨
  - `maxDecimalPlaces > 15`에서 IEEE 754 정밀도 한계로 결과 불안정

- 대신 `toExponential()` 기반 문자열 파싱 사용 (FP 곱셈 회피):
  ```typescript
  // runtime
  function countDecimalPlaces(n: number): number {
    const parts = n.toExponential().split('e');
    const mantissaDecimals = (parts[0].split('.')[1] || '').length;
    const exponent = parseInt(parts[1], 10);
    return Math.max(0, mantissaDecimals - exponent);
  }
  if (countDecimalPlaces(value as number) > maxDecimalPlaces) return false;

  // emit — toExponential 로직을 인라인 문자열로 직접 생성 (외부 참조 불필요)
  `var _exp=${varName}.toExponential().split('e');`
  + `var _mant=(_exp[0].split('.')[1]||'').length;`
  + `var _exp2=parseInt(_exp[1],10);`
  + `if(Math.max(0,_mant-_exp2)>${maxDecimalPlaces})${ctx.fail('isNumber')};`
  // maxDecimalPlaces는 seal 타임 상수이므로 리터럴로 삽입됨
  ```
- `toExponential()`은 과학 표기법이든 일반 표기법이든 항상 `mantissa + e + exponent` 형태를 반환하므로 원본 버그(toString의 과학 표기법 문제)가 구조적으로 불가능

### [x] C-8. `serialize-builder.ts:123` — serialize에서 discriminator 완전 무시 `🔴 Critical`

**현황**: serialize builder의 nested type 처리가 discriminator를 전혀 고려하지 않는다.

```typescript
// serialize-builder.ts:123-124
const nestedCls = meta.type!.resolvedClass ?? meta.type!.fn() as Function;
```

discriminator가 있는 필드에서 `resolvedClass`는 undefined (여러 subType 중 하나가 아닌 부모 타입만 반환). deserialize builder(line 702-722)는 `switch` 문으로 subType별 분기를 올바르게 처리하지만, serialize builder에는 이 로직이 **아예 없다**.

**영향**: polymorphic 객체를 serialize할 때 subType 고유 필드가 모두 누락된다.

**수정 계획**:

> **핵심 차이**: deserialize는 plain object에서 discriminator 문자열을 읽어 switch하지만, serialize는 **이미 타입이 확정된 클래스 인스턴스**를 다룬다. `keepDiscriminatorProperty: false`(기본값)이면 discriminator 문자열 프로퍼티가 인스턴스에 없으므로 **문자열 switch를 사용할 수 없다**.

- **dispatch 방식**: `instanceof` 사용 (문자열 switch 아님)
  ```typescript
  // seal 타임에 subType 생성자를 _refs[]에, sealed executor를 _execs[]에 등록
  // 생성 코드:
  if (instance['pet'] instanceof _refs[0]) {
    var __bk$sr_pet = _execs[0]._serialize(instance['pet'], _opts);
    __bk$sr_pet['type'] = 'dog';  // sub.name — round-trip을 위해 항상 삽입
    __bk$out['pet'] = __bk$sr_pet;
  } else if (instance['pet'] instanceof _refs[1]) {
    var __bk$sr_pet = _execs[1]._serialize(instance['pet'], _opts);
    __bk$sr_pet['type'] = 'cat';
    __bk$out['pet'] = __bk$sr_pet;
  }
  ```
- **discriminator property 복원**: `sub.name`은 seal 타임에 알려진 리터럴. subType의 `_serialize`가 이 프로퍼티를 출력하지 않으므로(데코레이터가 없음), 외부 serialize builder가 직접 삽입해야 함
- **`keepDiscriminatorProperty` 의미 확장**: serialize 방향에서는 "output에 discriminator를 포함할지"로 해석. 기본값 `true`(round-trip 보장). `false`면 삽입 생략
- **array 케이스**: `hasEach`일 때 `.map()` 안에서 같은 instanceof 분기 적용
- **default 분기**: serialize는 "검증 없음" 계약이므로, 매칭 실패 시 fallback으로 raw `instance[fieldKey]` 반환
- **`instanceof` 순서**: subType 간 상속이 있으면 (`GoldenRetriever extends DogDto`) `instanceof DogDto`가 GoldenRetriever도 매칭한다. seal 타임에 subTypes를 프로토타입 체인 깊이 기준 **most-specific-first**로 정렬하여 emit해야 한다:
  ```typescript
  const sorted = [...subTypes].sort((a, b) => {
    if (a.value.prototype instanceof b.value) return -1; // a가 b의 하위 → a를 먼저
    if (b.value.prototype instanceof a.value) return 1;
    return 0;
  });
  ```

### [x] C-9. `to-json-schema.ts:362` — nullable `$ref`가 invalid JSON Schema 생성 `🔴 Critical`

**위치**: `src/functions/to-json-schema.ts:362`

**현황**:
```typescript
if (meta.flags.isNullable) applyNullable(innerSchema);
```
`innerSchema`가 `{ $ref: '#/$defs/Address' }`일 때, `applyNullable`이 `type: ['null']`을 추가하여 `{ $ref: '#/$defs/Address', type: ['null'] }`을 생성한다. JSON Schema 2020-12에서 이는 `$ref`와 `type`의 **교집합**(allOf)으로 해석되어 — "null이면서 Address" — 항상 불만족(unsatisfiable) 스키마가 된다.

> C-3과 별개의 문제: C-3은 discriminator의 `$ref` + `properties` sibling, 이 항목은 **모든 nullable nested DTO 필드**에 영향.

**수정 계획**:
```typescript
if (meta.flags.isNullable) {
  if (innerSchema.$ref) {
    // 단일 nested DTO: $ref를 oneOf로 래핑
    innerSchema = { oneOf: [innerSchema, { type: 'null' }] };
  } else if (innerSchema.oneOf) {
    // discriminator: 기존 oneOf에 null 분기 추가
    innerSchema = { oneOf: [...innerSchema.oneOf, { type: 'null' }] };
  } else {
    applyNullable(innerSchema);
  }
}
```

> **C-3과의 상호작용**: C-3 수정 후 discriminator 스키마는 `{ oneOf: [{ allOf: [...] }, ...] }` 형태가 된다. `$ref`가 top-level에 없으므로 `innerSchema.$ref` 체크에 걸리지 않는다. `else if (innerSchema.oneOf)` 분기가 **반드시 필요**한 이유:
> - C-3만 적용: discriminator + nullable → `{ oneOf: [{allOf:[...]}, ...], type: ['null'] }` → **여전히 invalid**
> - C-9만 적용 (원안): `$ref` 체크에 안 걸리고 `applyNullable`로 빠져 `type: ['null']` 추가 → **여전히 invalid**
> - C-3 + C-9 보완안: `oneOf` 분기에 걸려 `{ oneOf: [..., {type:'null'}] }` → **valid**

### [x] C-10. `configure.ts:34` — `stripUnknown` API 이름이 실제 동작과 불일치 `🟠 High`

**현황**:
```typescript
whitelist: config.stripUnknown ?? false,
```
공개 API 옵션명은 `stripUnknown` ("알 수 없는 필드를 조용히 제거")이지만, 내부 `whitelist` 로직(deserialize-builder.ts:89-103)은 `whitelistViolation` **에러를 throw**한다. 조용한 제거가 아니다.

> **정정**: 현재 동작(rejection)은 **의도적 설계**이며, `test/e2e/whitelist.test.ts`에서 `BakerValidationError` throw를 명시적으로 assert하고 있다. 코드 버그가 아니라 **API 네이밍 문제**다. `stripUnknown`이라는 이름이 "조용한 제거"를 암시하지만 실제로는 "거부"를 수행한다.

**영향**: 사용자가 `stripUnknown: true`를 설정하면 unknown 필드가 조용히 무시될 것으로 기대하지만, 실제로는 validation error가 발생한다.

**수정 계획 (택 1)**:
1. **이름 변경**: `stripUnknown` → `rejectUnknown` 또는 `forbidUnknown` (실제 동작에 맞게). `stripUnknown`은 deprecated alias로 유지
2. **동작 추가**: `stripUnknown: true` (조용한 제거 — 신규 구현) + `rejectUnknown: true` (에러 — 현재 동작)
3. **이름만 교정**: `stripUnknown` → `whitelist` 그대로 공개. 가장 단순하지만 class-transformer 용어와 거리가 멀어짐

**권장**: 옵션 2 — class-transformer의 `excludeExtraneousValues`(조용한 제거)와 class-validator의 `forbidNonWhitelisted`(에러) 모두 지원. 현재 `stripUnknown` 사용자는 `rejectUnknown`으로 안내

### [x] C-11. `serialize-builder.ts:136-138` — nested array serialize 시 null 요소 크래시 `🟠 High`

**현황**:
```typescript
nestedCode = `${outputTarget} = instance[${JSON.stringify(fieldKey)}].map(function(__ser_item) {
  return _execs[${execIdx}]._serialize(__ser_item, _opts);
});`;
```
배열에 `null` 또는 `undefined` 요소가 있으면 `_serialize(null)`이 호출되어 크래시. deserialize builder는 내부에 `input == null` 가드가 있지만, serialize builder에는 없다.

**수정 계획**:
```typescript
`${outputTarget} = instance[${JSON.stringify(fieldKey)}].map(function(__ser_item) {
  return __ser_item == null ? __ser_item : _execs[${execIdx}]._serialize(__ser_item, _opts);
});`
```

### [x] C-12. `number.ts:14,37` — `min(NaN)`, `max(NaN)` 침묵 통과 `🟠 High`

**현황**: `min(parseInt("abc"))`처럼 `NaN`이 전달되면:
- emit: `if (value < NaN)` → 항상 `false` → **모든 값이 통과**
- runtime: `(value as number) < NaN` → 항상 `false` → **모든 값이 통과**

C-5(`isDivisibleBy(0)`)와 같은 클래스의 버그지만 방향이 반대 — C-5는 무조건 실패, C-12는 무조건 통과.

**수정 계획**:
```typescript
export function min(n: number, opts?: { exclusive?: boolean }): EmittableRule {
  if (!Number.isFinite(n)) throw new Error(`min: bound must be a finite number, got ${n}`);
  // ...
}
// max도 동일
```

### [x] C-13. `seal.ts:30` — `analyzeAsync`에서 `meta.type.fn()` try-catch 없음 `🟡 Medium`

**현황**: B-7(circular-analyzer)과 동일한 패턴이지만 다른 코드 경로.

```typescript
// seal.ts:30
const nestedClass = meta.type.resolvedClass ?? meta.type.fn() as Function;
```

`resolvedClass`가 미설정이고 `fn()`이 throw하면 전체 seal이 크래시. B-7과 달리 이 경로는 `sealOne()` → `analyzeAsync()` 호출 순서에서 `fn()`이 아직 검증되지 않은 시점에 호출될 수 있다.

**수정 계획**: B-7과 동일한 try-catch + SealError 패턴 적용.

### [x] C-14. `to-json-schema.ts:146-149` — class-level `@Schema`가 `$defs`/`properties` 덮어쓰기 `🟡 Medium`

**현황**:
```typescript
const classSchema = (Class as any)[RAW_CLASS_SCHEMA];
if (classSchema) {
  Object.assign(rootSchema, classSchema);
}
```
사용자가 `@Schema({ properties: { extra: ... } })`를 지정하면 자동 생성된 모든 properties가 **덮어씌워진다**. `$defs`, `$schema`, `required`도 마찬가지.

**수정 계획**:
- 키별 deep merge 전략:
  ```typescript
  if (classSchema) {
    for (const [key, val] of Object.entries(classSchema)) {
      if (key === 'properties' || key === '$defs') {
        rootSchema[key] = { ...(rootSchema[key] as object ?? {}), ...(val as object) };
      } else if (key === 'required') {
        rootSchema.required = [...new Set([...(rootSchema.required ?? []), ...(val as string[])])];
      } else {
        (rootSchema as any)[key] = val;
      }
    }
  }
  ```

### [x] C-15. `to-json-schema.ts:413` — user composition schema가 auto schema를 완전 제거 `🟡 Medium`

**현황**:
```typescript
return hasComposition ? { ...userSchema } : { ...autoSchema, ...userSchema };
```
사용자 스키마에 `allOf`/`anyOf`/`oneOf`가 있으면 자동 생성된 `type`, `format`, `minLength` 등이 **모두 사라진다**.

**수정 계획**:
```typescript
return hasComposition
  ? { ...autoSchema, ...userSchema }  // auto를 base로, user가 override
  : { ...autoSchema, ...userSchema };
```
또는 composition keywords만 특별 처리하여 auto schema와 병합.

### [x] C-16. `seal.ts:93-94` — RAW 삭제 후 미봉인 하위 클래스의 `mergeInheritance` 실패 `🟢 Low` `보류`

**현황**: 성공적 seal 후 모든 클래스에서 `delete (Class as any)[RAW]`가 실행된다. `mergeInheritance`는 프로토타입 체인을 따라 `RAW`를 읽는데, 부모 클래스가 seal되어 RAW가 삭제된 상태에서 아직 seal되지 않은 자식 클래스의 `mergeInheritance`를 호출하면 부모 메타데이터가 누락된다.

> `toJsonSchema`에서 `sealed?._merged ?? mergeInheritance(C)` 패턴을 사용하므로, sealed 클래스는 캐시된 `_merged`를 사용. 문제는 sealed 클래스의 하위 클래스가 동적으로 정의될 때만 발생.

**수정 계획**: `delete (Class as any)[RAW]` → `Object.freeze((Class as any)[RAW])` 로 변경.

> **검증 완료**: freeze가 기존 코드를 깨뜨리지 않음을 확인:
> - `ensureMeta()`의 `hasOwnProperty(ctor, RAW)` 가드가 자식 클래스에서 frozen 부모 RAW로의 쓰기를 방지 (자식은 자신의 RAW를 새로 생성)
> - `mergeInheritance()`는 RAW를 **읽기만** 하므로 frozen 객체에서 정상 동작
> - `_sealOnDemand()`의 `hasOwn(Class, RAW)` 가드는 SEALED 체크가 먼저 통과하므로 영향 없음
> - `circular-analyzer`도 읽기 전용이므로 영향 없음
> - 유일한 이론적 위험: 이미 seal된 클래스에 데코레이터를 추가하면 TypeError (strict mode) — 이는 지원하지 않는 패턴이며, 현재 delete 방식에서도 프로토타입 체인 corruption이 발생하는 동일하게 broken한 시나리오
>
> **보류 사유** (type mutation은 해결됨 — sealOne이 type/flags를 복사 후 mutate하도록 수정):
> freeze 적용 시 `unseal()`의 RAW 복원이 깨진다. `unseal()`은 `_merged`(병합+정규화된 데이터)를 per-class RAW로 복원하는데, freeze하면 `hasOwnProperty(Class, RAW)`이 true여서 복원을 스킵한다. 조건을 제거하면 `_merged`(parent 포함 병합 데이터)가 per-class RAW가 되어 다음 `mergeInheritance`에서 parent 필드가 중복 병합된다. 근본 해결: `unseal()`이 `_merged` 대신 seal 전 원본 per-class RAW snapshot을 복원해야 한다. 이를 위해 `_rawSnapshots` Map 도입을 시도했으나, `_autoSeal` 실패 시 poison 클래스(banned field)가 registry에 잔류하는 별도 격리 문제와 결합되어 연쇄 실패 발생. `unseal()` 아키텍처 재설계가 필요하다.

### [x] C-17. `deserialize-builder.ts:741-742` — nested array 레벨 룰에 커스텀 message/context 누락 `🟢 Low`

**현황**:
```typescript
const extra = computeRuleExtras(rd, fieldKey, varName, ctx); // 계산됨
const ruleEmit = rd.rule.emit(varName, emitCtx); // 기본 emitCtx 사용 — extra 미적용
code += `  ${ruleEmit}\n`;
```
`extra`가 계산되지만 사용되지 않는다. `emitCtx`에 per-rule `message`/`context`가 주입되지 않아, nested array 필드에 적용된 array-level 룰(e.g., `arrayMinSize(3, { message: "Too few" })`)의 커스텀 메시지가 무시된다.

**수정 계획**: `buildRulesCode`에서 사용하는 `makeRuleEmitCtx` 패턴을 이 코드 경로에도 적용.

---

## D. 스파게티 코드 리팩토링

> **성능 영향**: D-1~D-4는 모두 seal-time 코드 생성기에 대한 리팩토링이다. 함수 호출 오버헤드가 추가되지만, seal은 애플리케이션 시작 시 1회만 실행되므로 런타임 성능에 영향 없다. 벤치마크 검증은 불필요하다.

### [x] D-1. `buildRulesCode()` 254줄 god function 분해 `🟡 Medium`

**위치**: `deserialize-builder.ts:428-682`

**수정 계획**: 5개 함수로 분해
1. `categorizeRules(validation)` — each/nonEach/typed 분류 + 충돌 감지 (437-458)
2. `resolveTypeGate(categorized, meta, ctx)` — asserter/conversion/hint 게이트 결정 (460-507)
3. `emitTypedRules(gate, rules, ...)` — 타입 게이트 + 내부 룰 코드 생성 (509-592)
4. `emitGeneralRules(rules, ...)` — 타입 무관 룰 코드 생성 (593-612)
5. `emitEachRules(rules, ...)` — Array/Set/Map each 룰 코드 생성 (614-679)

> **주의**: `emitTypedRules` 내부의 `emitInnerRules` 클로저(line 539)가 외부 스코프의 `otherGeneral`, `gateDeps`, `typeAsserter`, `typeAsserterIdx`, `GATE_ONLY_ASSERTERS`를 참조한다. 추출 시 이들을 `TypeGateConfig` 구조체로 묶어 파라미터로 전달해야 한다:
> ```typescript
> interface TypeGateConfig {
>   otherGeneral: RuleDef[];
>   gateDeps: Set<string>;
>   typeAsserter: EmittableRule | null;
>   typeAsserterIdx: number;
>   gateOnlyAsserters: Set<string>;
> }
> ```

### [x] D-2. `Field()` 데코레이터 125줄 분해 `🟢 Low`

**위치**: `field.ts:121-245`

**수정 계획**: 내부 헬퍼로 분해
1. `parseFieldArgs(args)` — 4가지 오버로드 인자 정규화 (127-149)
2. `applyValidation(meta, rules, options)` — 룰 등록 + arrayOf 처리 (151-167)
3. `applyExpose(meta, options)` — expose 5분기 로직 (183-197)
4. `applyTransform(meta, options)` — async 감지 + 방향 래핑 (210-234)

> **참고**: `applyExclude` (~9줄), `applySchema` (~6줄), `flags` (3줄)은 분량이 작아 인라인 유지가 적절하다.

### [x] D-3. `generateFieldCode()` nullable/optional 매트릭스 정리 `🟢 Low`

**위치**: `deserialize-builder.ts:227-261`

**현황**: 5가지 케이스에 대한 조건 분기:

| isNullable | useOptionalGuard | isDefined | 케이스 |
|---|---|---|---|
| true | true | - | nullable+optional: null→assign, undefined→skip |
| true | false | - | nullable: undefined→error, null→assign |
| false | false | true | isDefined: undefined→error, run validation |
| false | true | false | optional: undefined/null→skip |
| false | false | false | default: undefined/null→error |

> **참고**: 현재 코드에도 `// Case N:` 주석이 각 분기에 존재하여 가독성이 확보되어 있다. 전략 패턴 도입은 명확성을 높이지만 간접 참조를 추가한다. `isDefined`가 3번째 독립 축이므로 2-key boolean matrix가 아닌 3-key 조합이 필요하다.

**수정 계획**:
- truth table 기반 전략 패턴으로 교체:
  ```typescript
  const GUARD_STRATEGIES = {
    'nullable+optional': (varName, assignNull, validationCode) => ...,
    'nullable': (varName, assignNull, validationCode) => ...,
    'defined': (varName, validationCode) => ...,
    'optional': (varName, validationCode) => ...,
    'default': (varName, validationCode) => ...,
  };
  ```
- 분기 조건을 키로 변환하여 전략 선택

### [x] D-4. Array/Set/Map each 코드 중복 제거 `🟡 Medium`

**위치**: `deserialize-builder.ts:614-679`

> **인과관계**: C-2 버그(Set/Map stopAtFirstError 인덱스 누락)는 이 코드 중복에서 직접 파생되었다. collectErrors 경로를 stopAtFirstError 경로로 복제하면서 카운터 변수 선언과 인덱스 경로 삽입이 누락되었다. 템플릿 통합으로 이런 불일치를 구조적으로 방지한다.

**현황**: collectErrors/stopAtFirstError 2개 분기 × Array/Set/Map 3개 컬렉션 = 6개 near-identical 블록. ~50줄의 구조적 중복.

**수정 계획**:
- 컬렉션 타입별 이터레이션 메타를 배열로 정의:
  ```typescript
  const COLLECTION_TYPES = [
    { guard: 'Array.isArray(V)', loop: 'for(var I=0;I<V.length;I++)', elem: 'V[I]', idx: 'I' },
    { guard: 'V instanceof Set', loop: 'for(var E of V)', elem: 'E', idx: 'SI', needsCounter: true },
    { guard: 'V instanceof Map', loop: 'for(var E of V.values())', elem: 'E', idx: 'MI', needsCounter: true },
  ];
  ```
- Set/Map에 `needsCounter: true` 플래그 → 카운터 변수 자동 선언 + 인덱스 경로 삽입
- 단일 템플릿 함수에서 collectErrors/stopAtFirstError 분기 모두 처리

### [x] D-5. 룰 생성 보일러플레이트 통일 `🟢 Low`

**위치**: `rules/string.ts`, `rules/number.ts`, `rules/array.ts` 전체

**현황**: 2가지 패턴 혼재:
1. **`makeStringRule()` 헬퍼** — `string.ts`에서 ~19회 사용. `constraints` 미지원이라 `(rule as any).constraints = {}` 후처리 필요
2. **직접 프로퍼티 주입** — `(fn as any).emit = ...`, `(fn as any).ruleName = ...` — `string.ts` 84회, `number.ts` 12회, `array.ts` 전체

> **정정**: `createRule()` (공개 API, `src/create-rule.ts`)은 내부 룰 파일에서 사용되지 않는다. 혼재하는 패턴은 2가지이지, 3가지가 아니다.

**수정 계획**:
- `makeStringRule`에 `constraints` 파라미터 추가하여 후처리 제거
- `makeRule(config)` 통합 헬퍼로 확장:
  ```typescript
  function makeRule(config: {
    name: string;
    requiresType?: string;
    constraints?: Record<string, unknown>;
    validate: (value: unknown) => boolean;
    emit: (varName: string, ctx: EmitContext) => string;
  }): EmittableRule
  ```
- 단계적 마이그레이션: 먼저 `makeStringRule` 확장 → 이후 `number.ts`, `array.ts`의 직접 주입을 점진적 전환 (84+ 사이트, 기계적 변환)

### [x] D-6. 매직 문자열/변수명 상수화 `🟢 Low`

**위치**: `deserialize-builder.ts` 전체

**현황**: 생성 코드에서 사용하는 내부 변수명이 18개 존재하며 모두 인라인 문자열로 분산되어 있다. 오타 시 silent bug를 유발한다.

**수정 계획**:
- 변수 접두사를 상수로 정의:
  ```typescript
  const GEN = {
    // 필드/루프 변수
    field: '__bk$f_',      // field value
    index: '__bk$i_',      // array index
    setIdx: '__bk$si_',    // set iteration index
    setVal: '__bk$sv_',    // set iteration value
    mapIdx: '__bk$mi_',    // map iteration index
    mapVal: '__bk$mv_',    // map iteration value

    // 에러 처리
    mark: '__bk$mark_',    // error mark position
    skip: '__bk$skip_',    // skip flag

    // 중첩 결과
    result: '__bk$r_',     // nested deserialize result
    errors: '__bk$re_',    // nested deserialize errors
    arr: '__bk$arr_',      // nested array buffer
    disc: '__bk$dt_',      // discriminator value
    nestedIdx: '__bk$j_',  // nested error loop index

    // preamble/epilogue 전용
    out: '__bk$out',       // output instance
    errList: '__bk$errors',// top-level error list
    groups: '__bk$groups', // groups array
    groupsSet: '__bk$groupsSet', // groups Set
    key: '__bk$k',         // whitelist loop key
  } as const;
  ```
- `GATE_ONLY_ASSERTERS` 사유 주석 추가: isString/isBoolean은 typeof 체크가 게이트 조건과 완전 동치이므로 게이트 통과 시 재검증 불필요

---

## E. 테스트 보강

### [x] E-1. Set/Map each 룰 테스트 추가 `→ C-2`

**현재 `each-option.test.ts`**: Array만 테스트. Set/Map **0개**.

**추가할 테스트**:
- Set with each: true + stopAtFirstError → 에러 경로에 인덱스 포함 확인 (e.g., `field[0]`, `field[1]`)
- Map with each: true + stopAtFirstError → 에러 경로에 인덱스 포함 확인
- Set with each: true + collectErrors → 모든 에러 수집 확인
- Map with each: true + collectErrors → 모든 에러 수집 확인

### [x] E-2. analyzeAsync discriminator 순환 테스트 `→ C-1`

**추가할 테스트**:
- async transform이 있는 discriminator subType → async 정확히 감지
- discriminator subType이 부모를 참조하는 순환 구조 → 무한루프 아닌 정상 종료
- **추가**: discriminator subType 3개 이상이 서로를 참조하는 순환 구조 → visited Set 공유 확인 (C-1 회귀 방지)

### [x] E-3. circular-analyzer lazy type throw 테스트 `→ B-7`

**추가할 테스트**:
- `@Field({ type: () => { throw new Error('boom') } })` → SealError with 원본 메시지 포함
- SealError 메시지에 클래스명과 필드명이 포함되어 있는지 확인

### [x] E-4. isVariableWidth 빈 문자열 테스트 `→ C-4`

**추가할 테스트**:
- `isVariableWidth('')` → false
- emit 생성 코드에서도 빈 문자열 → fail

### [x] E-5. isDivisibleBy(0) 테스트 `→ C-5`

**추가할 테스트**:
- `isDivisibleBy(0)` 호출 시 Error throw (seal 타임)
- `isDivisibleBy(1)` 등 정상 케이스 회귀 확인

### [x] E-6. isURL 포트 경계값 테스트 `→ C-6`

**추가할 테스트**:
- `isURL('https://example.com:65535')` → true
- `isURL('https://example.com:65536')` → false
- `isURL('https://example.com:99999')` → false
- `isURL('https://example.com:0')` → true (port 0은 유효)

### [x] E-7. isNumber maxDecimalPlaces 과학 표기법 테스트 `→ C-7`

**추가할 테스트**:
- `isNumber({ maxDecimalPlaces: 2 })(1e-10)` → false (소수점 10자리)
- `isNumber({ maxDecimalPlaces: 0 })(1e5)` → true (정수)
- `isNumber({ maxDecimalPlaces: 5 })(1e-5)` → true (정확히 5자리)
- `isNumber({ maxDecimalPlaces: 4 })(1e-5)` → false (5자리인데 4자리 허용)

### [x] E-8. applyNullable 중복 null 테스트 `→ B-11`

**추가할 테스트**:
- nullable 적용 후 schema.type에 'null'이 한 번만 존재
- `schema.type`이 이미 `'null'`인 경우 → `['null']` (중복 아님)
- `schema.type`이 이미 `['string', 'null']`인 경우 → 변경 없음

### [x] E-9. discriminator JSON Schema 구조 테스트 `→ C-3`

**기존 테스트 수정** (C-3 버그를 정답으로 고정하고 있는 테스트):
- `test/e2e/discriminator-advanced.test.ts:101-105` → `allOf` 래핑 구조로 expect 값 변경
- `test/e2e/nested-decorator.test.ts:134-142` → 양쪽 `oneOf` entry 모두 `allOf` 구조로 변경
- `src/functions/to-json-schema.spec.ts:562-572` → unit spec도 동일하게 변경

**추가할 테스트**:
- `$ref`와 `properties`가 같은 레벨에 있지 않음 확인
- 생성된 스키마를 ajv 등으로 실제 검증 가능한지 확인

### [x] E-10. async 감지 robustness 테스트 `→ B-6`

**추가할 테스트**:
- `Object.defineProperty(fn, 'name', { value: 'e' })` 같은 minified 패턴에서도 async 감지
- `Object.defineProperty(asyncFn, 'constructor', { value: { name: 'Function' } })` — prototype은 변경 안 됨 → 여전히 async 감지

### [x] E-11. emit 코드 컴파일 통합 테스트

**현황**: 모든 emit 테스트가 mock EmitContext 사용. 생성 코드가 유효한 JS인지 미검증.

**추가할 테스트**:
- 주요 룰의 emit 출력을 `new Function()`으로 컴파일 가능 확인
- 컴파일된 함수 실행 결과가 직접 호출과 동일한지 확인

### [x] E-12. configure() 호출 시점 테스트 `→ B-10`

**추가할 테스트**:
- seal 후 configure() 호출 시 B-10에서 선택한 대안에 따라:
  - 대안 A: 반환값에 warning 포함 확인
  - 대안 B: `strict: true` 시 throw 확인
  - 대안 C: Error throw 확인

### [x] E-13. -0, NaN, Infinity 수치 에지케이스 테스트

**추가할 테스트**:
- `isNegative(-0)` → false (수학적으로 0)
- `isDivisibleBy(Infinity)` → 명확한 동작 확인 (throw 또는 명시적 결과)
- `isPositive(NaN)` → false

### [x] E-14. analyzeAsync visited Set 공유 테스트 `→ C-1` `신규`

**추가할 테스트**:
- discriminator subType A → subType B → subType A 순환 참조 → `analyzeAsync`가 무한 재귀 없이 정상 반환
- subType 3개 이상에서 교차 참조 시 visited Set이 전체에 공유됨을 확인

### [x] E-15. B-10 partial-seal 시나리오 테스트 `→ B-10` `신규`

**추가할 테스트**:
- 클래스 A seal → `configure()` 호출 → 클래스 B seal → B에 새 설정이 적용됨을 확인
- 이 테스트는 B-10의 대안 선택 시 regression guard 역할

### [x] E-16. discriminator serialize 테스트 `→ C-8` `신규`

**추가할 테스트**:
- polymorphic 필드(discriminator)가 있는 DTO를 `serialize()` → subType 고유 필드 포함 확인
- Dog(breed), Cat(indoor) subType → serialize 후 breed/indoor 필드 존재 확인
- 현재 테스트가 없어 C-8 버그가 감지되지 않음

### [x] E-17. nullable nested DTO JSON Schema 테스트 `→ C-9` `신규`

**추가할 테스트**:
- `@Field({ type: () => Address, nullable: true })` → JSON Schema 출력이 `oneOf: [$ref, {type:'null'}]` 확인
- 생성된 스키마를 ajv로 검증 가능한지 확인 (null 입력 + 유효 Address 입력 모두 통과)

### [x] E-18. stripUnknown 동작 일관성 테스트 `→ C-10` `신규`

**추가할 테스트**:
- `configure({ stripUnknown: true })` 후 unknown 필드 포함 입력 → 현재 동작 문서화
- API 이름 수정 후: `stripUnknown: true` → 에러 없이 unknown 제거 확인
- `forbidUnknown: true` → whitelistViolation 에러 확인

### [x] E-19. nested array null 요소 serialize 테스트 `→ C-11` `신규`

**추가할 테스트**:
- `@Field({ type: () => [Child] })` 필드에 `[child1, null, child3]` → serialize 시 크래시하지 않음
- null 요소가 그대로 null로 출력되는지 확인

### [x] E-20. min(NaN), max(NaN) 팩토리 가드 테스트 `→ C-12` `신규`

**추가할 테스트**:
- `min(NaN)` → throw Error
- `max(Infinity)` → throw Error
- `min(parseInt('abc'))` → throw Error

### [x] E-21. 상속 4+ 레벨 + 중간 override 테스트 `신규`

**추가할 테스트**:
- GrandGrandChild → GrandChild → Child → Base (4레벨)
- Base에 `@Field(isString())`, Child에 `@Field(isString(), minLength(3))` → GrandGrandChild에서 두 룰 모두 적용 확인
- 중간 레벨에서 transform override 시 자식이 올바르게 상속

### [x] E-22. groups + 방향별 exclude 조합 테스트 `신규`

**추가할 테스트**:
- `@Field({ groups: ['admin'], exclude: 'serializeOnly' })` → admin 그룹 deserialize에서만 보임
- `@Field({ groups: ['public'], serializeName: 'x' })` → public 그룹 serialize 시 `x`로 출력

### [x] E-23. 동일 DTO에 discriminator 필드 2개 테스트 `신규`

**추가할 테스트**:
- `payment: discriminator(type → CreditCard|BankTransfer)` + `address: discriminator(kind → Home|Office)`
- 두 필드 모두 올바르게 역직렬화 + 에러 경로 분리 확인

### [x] E-24. async transform 실패 시 에러 경로 테스트 `신규`

**추가할 테스트**:
- async transform이 invalid 값을 반환 → 후속 validation error의 path/code 정확성 확인
- async transform이 throw → 에러가 적절히 전파되는지 확인

### [x] E-25. concurrent seal (Promise.all) 테스트 `신규`

**추가할 테스트**:
- 3개 미봉인 DTO에 `Promise.all([deserialize(A, ...), deserialize(B, ...), deserialize(C, ...)])` → 모두 성공
- auto-seal 경쟁 조건이 없음을 확인

### [x] E-26. frozen/null-prototype 입력 테스트 `신규`

**추가할 테스트**:
- `Object.freeze({ name: 'test', age: 25 })` → deserialize 정상 동작
- `Object.create(null, { name: { value: 'test', enumerable: true } })` → deserialize 정상 동작

### [x] E-27. class-level @Schema deep merge 테스트 `→ C-14` `신규`

**추가할 테스트**:
- `@Schema({ properties: { extra: { type: 'string' } } })` → auto-generated properties가 보존되면서 extra 추가
- `@Schema({ $defs: { custom: ... } })` → auto-generated $defs가 보존되면서 custom 추가

---

## F. 코드 품질 개선

### [x] F-1. `Object.hasOwn()` 통일 `🟢 Low`

**현황**: `seal.ts:244` (`mergeInheritance`)는 `Object.hasOwn()`, 나머지 5개소 (`seal.ts:85,106,107,120,147`)는 `Object.prototype.hasOwnProperty.call()`.
Bun 벤치마크 결과 성능 동등 (~8.5ms/10M). `Object.hasOwn`은 ES2022 / Node 16.9+.

**수정 계획**: 전체를 `Object.hasOwn()`으로 통일. 프로젝트가 이미 `Object.hasOwn`을 사용하고 있으므로 호환성 문제 없음.

### [x] F-2. `collect.ts:16` — 불필요한 `globalRegistry.add()` 반복 `🟢 Low`

**현황**: 매 데코레이터 호출마다 `globalRegistry.add(ctor)` 실행. `collectClassSchema` (line 81)에서도 별도로 `globalRegistry.add(target)` 호출.

> **참고**: `globalRegistry`는 `Set`이므로 중복 `add()`는 idempotent — 기능상 문제 없음. 순수 미세 최적화이며, Set 내부에서 이미 uniqueness check를 수행하므로 외부 guard 추가의 실질적 이점은 미미하다.

**수정 계획**:
- `ensureMeta()` 내에서 `RAW` 심볼을 새로 생성할 때만 registry.add:
  ```typescript
  if (!Object.hasOwn(ctor, RAW)) {
    (ctor as any)[RAW] = Object.create(null);
    globalRegistry.add(ctor);
  }
  ```

### [x] ~~F-3. `_sealOnDemand` snapshot 최적화~~ `삭제`

> **검증 결과**: 이 항목은 오진이다. 현재 구현이 정확하다.
>
> `_sealOnDemand`에서 `[...globalRegistry]`로 배열 복사 후 순회하므로, 순회 중 `globalRegistry.delete(C)` 호출이 안전하다 (수정되는 것은 원본 Set이며, 순회 대상은 복사된 배열). `before` snapshot도 재귀 seal로 새로 sealed된 클래스를 정확히 식별하기 위해 필요하다.
>
> 제안된 "`globalRegistry.size`만 기록" 대안은 Set이 삽입 순서를 보장하더라도 "뒤에서 N개만 순회" 연산이 불가능하므로 실현 불가능하거나 오히려 복잡해진다.

### [x] F-4. `expose-validator.ts:45` — 그룹 겹침 탐지 Set 사용 `🟢 Low`

**현황**: `aGroups.some(g => bGroups.includes(g))` — O(n×m).

> **참고**: seal-time 전용이며, `entries.length`는 실제로 1-3개 수준. 실질적 성능 영향 없음.

**수정 계획**:
```typescript
const bSet = new Set(bGroups);
const overlapping = aGroups.filter(g => bSet.has(g));
```

### [x] F-5. `rules/array.ts` — `arrayContains` O(n×m) → Set `🟢 Low`

**현황**: `values.every(v => array.includes(v))`.

> **참고**: Set 최적화는 primitive 값에만 유효하다. 객체 참조 비교가 필요한 경우 `Set.has()`와 `Array.includes()` 모두 identity check이므로 동일한 결과를 반환하지만, `arrayContains`의 일반적 사용 사례는 primitive 배열이다.

**수정 계획**:
```typescript
const arraySet = new Set(array);
return values.every(v => arraySet.has(v));
```

### [x] F-6. `rules/string.ts` — IPv6 정규식 ReDoS 위험 검토 `🟢 Low`

**현황**: `IPV6_RE`에 14개 대안 분기. 모든 대안이 `^`/`$`로 anchored되어 있고 수량자가 bounded (`{1,4}`, `{1,7}` 등).

> **위험도 평가**: anchored 대안 분기에서 JavaScript 엔진은 비매칭 시 빠르게 실패한다. 실제 ReDoS 취약성은 **낮음**. 다만 `:::::::::::::::::::` 같은 malicious input에서 14개 대안을 모두 시도하므로 이론적 slowdown은 존재. 사용자 입력을 직접 검증하는 web-facing 컨텍스트에서는 주의가 필요하다.

**수정 계획**:
- ReDoS 분석 도구로 정규식 검증 (redos-checker 또는 수동 분석)
- 필요 시 정규식을 단계별 파싱으로 교체 (split by ':' → 각 그룹 검증)

### [x] F-7. serialize/deserialize 삼중 SEALED 체크 단순화 `🟢 Low`

**현황**: `src/functions/serialize.ts`(line 21-32), `src/functions/deserialize.ts`(line 24-36)에서 3중 중첩 if.

> **참고**: 3단계 fallback chain은 의도적 설계이다:
> 1. 이미 sealed → fast path
> 2. 첫 호출 → `_autoSeal()`로 batch seal
> 3. 동적 import로 늦게 등록 → `_sealOnDemand(Class)`
> 4. 데코레이터 없는 클래스 → error
>
> 로직 자체에 버그는 없다. 중복만 제거한다.

**수정 계획**:
- 공유 헬퍼 `ensureSealed(Class)` 추출:
  ```typescript
  function ensureSealed<T>(Class: ClassConstructor<T>): SealedExecutors<T> {
    let sealed = (Class as any)[SEALED];
    if (!sealed) { _autoSeal(); sealed = (Class as any)[SEALED]; }
    if (!sealed) { _sealOnDemand(Class); sealed = (Class as any)[SEALED]; }
    if (!sealed) throw new SealError(`${Class.name} has no @Field decorators`);
    return sealed;
  }
  ```
- `serialize.ts`, `deserialize.ts` 양쪽에서 이 헬퍼 호출

