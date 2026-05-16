# Baker DX Reform Plan

Canonical work plan. Backup of the prior multi-round revision history is at `/tmp/PLAN.md.bak`. Every claim below is paired with a reproduction artifact under `/tmp/baker-verify/` or `/tmp/codex-baker-verify/`.

---

## 1. Verified defects (must fix)

Each row has a file:line citation and a self-contained reproduction script.

| ID | Severity | Location | What is wrong | Reproduction |
|---|---|---|---|---|
| F-1 | High | `src/seal/circular-analyzer.ts:13-52` | `walk()` 가 `meta.type.fn()` 과 `discriminator.subTypes` 는 walk 하지만 `meta.type.collectionValue` (Set/Map nested DTO) 는 walk 안 함. Set/Map 안의 nested DTO 사이클에 WeakSet 보호 미생성 → 사용자가 circular 입력 시 stack overflow. | `/tmp/baker-verify/cir-set.ts` → `Maximum call stack size exceeded` (7 ms) |
| F-2 | High | `src/seal/deserialize-builder.ts:1191-1203` | `discriminator: { subTypes: [] }` 입력 시 codegen 이 `switch` 본문 없는 invalid JS 생성. 첫 seal 의 `new Function` 이 `SyntaxError` throw. | `/tmp/baker-verify/d7-disc.ts` → `SyntaxError: Unexpected keyword 'else'` |
| N-3 | High | `src/seal/deserialize-builder.ts:136` | seal 시점에 `refs.push(new WeakSet())` — 단일 WeakSet 이 executor 에 공유 저장. 동시 async 호출 두 개가 같은 입력 객체로 진행 중일 때 두 번째 호출이 첫 번째의 in-flight 객체를 WeakSet 에서 봄 → acyclic 입력에 false `circular` 에러. | `/tmp/baker-verify/n3-race-mine.ts` → a 성공, b `[{path:'',code:'circular'}]` |
| F-4 | Medium | `src/interfaces.ts:38` + codegen 양쪽 | `RuntimeOptions` 가 `groups` 만 정의. codegen 이 `_opts.groups` 만 read (deserialize-builder.ts:168, serialize-builder.ts:138). 다른 모든 키는 silent drop — `stopAtFirstError`/`autoConvert`/`allowClassDefaults`/`forbidUnknown`/`debug` 를 per-call 인자로 넘기면 무시됨. | `/tmp/baker-verify/silent-drops.ts` → 7 drops 확정 |
| N-4 | Medium | `src/seal/deserialize-builder.ts:369` | 필드 추출 `input[extractKey]` 가 prototype chain 도 읽음. `Object.hasOwn` 검사 없음 → input 의 prototype 속성이 DTO 결과에 복사. | `/tmp/baker-verify/n4-proto-mine.ts` → `Object.hasOwn(input,'name')=false` 인데 `result.name='from-prototype'` |
| N-9 | Medium | `src/seal/serialize-builder.ts:254` | 원시 `Map<K,V>` serialize 가 `Object.fromEntries(fieldVal)` 사용. 비-string 키 silent stringify + 충돌 시 덮어쓰기. | `/tmp/baker-verify/n9-map-mine.ts` → `Map([[1,'a'],[{},'b'],[{foo:1},'c'],['1','d']])` 4 entries → `{"1":"d","[object Object]":"c"}` 2 keys |
| F-3 | Low | `src/seal/deserialize-builder.ts:1202` | 잘못된 discriminator 값 입력 시 `invalidDiscriminator` 코드만 반환. 유효한 값 목록 미명시. | `/tmp/baker-verify/d7-disc.ts` → `{path:'pet',code:'invalidDiscriminator'}` only |
| F-8 | Low | `src/rules/locales.ts:191` | FR passport `/[A-Z0-9]{9}/i` — 앵커 둘 다 없음. partial match 통과. | `/tmp/baker-verify/fr-passport.ts` → `"garbage_ABC123456_more"` true |
| F-9 | Low | `src/rules/string.ts:1061` | MAGNET_URI_RE 닫는 `$` 없음. 접두사 뒤 임의 garbage 통과. | `/tmp/baker-verify/f9-magnet.ts` → `magnet:...EVIL_PAYLOAD<script>` true |
| N-6 | Low | `src/seal/seal.ts:320` | `mergeInheritance` 가 validation 룰 dedup 을 object identity 만 검사. 부모 + 자식이 같은 룰을 다른 인스턴스로 재선언 시 (예: `minLength(5)` 두 번 호출) 두 룰 모두 보존 → 같은 코드 중복 에러. | `/tmp/baker-verify/n6-inh-mine.ts` → `errors=[{code:'minLength'},{code:'minLength'}]` |
| F-5 | Info | `src/decorators/field.ts:105` | `@Field(isString())` 류 misuse 는 TS strict 가 `TS2554` 로 막음. 진짜 cryptic 은 `@Field(isNumber)` (factory 미호출) 만. | `/tmp/codex-baker-verify/f5-ts-level.ts` 컴파일 에러 / `/tmp/codex-baker-verify/f5-rule-factory-misuse.ts` 통과 |
| F-6 | Info | `src/seal/deserialize-builder.ts:175` | baker contract: `@Field` 데코된 필드만 처리. 미데코 필드는 raw 메타 미등록 → 결과 인스턴스에 부재, serialize 출력에 부재. **버그 아닌 명세** — README 명시 필요. | `/tmp/baker-verify/d1-d9-symptoms.ts` 참조 |
| F-7 | Info | `src/functions/deserialize.ts:30` | async 룰 하나라도 있으면 `_isAsync=true` → 전체 DTO 반환 Promise. **버그 아닌 명세** — TS 에서는 union 반환으로 표면화. 사용자가 `instanceof Promise` 분기 또는 `await` 처리. | 동일 |
| H-1 | Info | `src/functions/_run-sealed.ts` | 29 LOC `_runSealed` 함수, src 콜러 0. `test/e2e/change-coverage.test.ts:9` 만 import. dead code. | `grep -rn '_runSealed' src/` |

---

## 2. Work plan

| Step | 작업 | Touched files |
|---|---|---|
| W1 | F-1 fix: `walk()` 가 `meta.type?.collectionValue` 도 walk. ~5 LOC 추가. | `src/seal/circular-analyzer.ts` |
| W2 | F-2 fix: `validate-meta.ts` 신규. seal 시점에 discriminator (empty subTypes / 잘못된 subType / 이름 중복 / property 누락) / Set·Map (페어링 / target 메타) / 상속 (incompatible 룰 충돌) / async-in-sync 검사. 모두 `SealError(message)` throw — 새 클래스 추가 없음. | `src/seal/validate-meta.ts` 신규, `src/seal/seal.ts` 에서 호출 |
| W3 | F-3 fix: discriminator switch 의 `default:` 에서 fail message 에 유효한 subType 이름 목록 포함. | `src/seal/deserialize-builder.ts:1202` |
| W4 | F-4 fix: 신규 `src/functions/_check-call-options.ts`. `groups` 외 모든 키 → `SealError`. `deserialize`/`validate`/`serialize` 진입에서 호출. 내부 `SealOptions` legacy 키 → `BakerConfig` 키로 통일 (public 변경 0). | `src/functions/_check-call-options.ts` 신규, `src/functions/*.ts`, `src/interfaces.ts` |
| W5 | F-5 fix: `parseFieldArgs` 에 `.emit` + `.ruleName` 구조 검사. 부재 시 `SealError(`@Field on ${cls}.${key}: arg is not a rule. 4가지 valid 형태: ...`)`. | `src/decorators/field.ts:105` |
| W6 | N-3 fix: codegen 이 `var __seen = new WeakSet();` 를 emit (함수 본문 내부, ref 공유 X). 호출당 새 인스턴스. | `src/seal/deserialize-builder.ts:136` 의 `refs.push(new WeakSet())` 줄 제거 + 200 줄 근처 body 에 `var __seen = ...` emit |
| W7 | N-4 fix: extractCode 가 `var x = Object.hasOwn(input, key) ? input[key] : undefined`. | `src/seal/deserialize-builder.ts:367-370` |
| W8 | N-9 fix: seal 시점에 `Map<K,V>` 의 K 가 `string` 또는 `number` 가 아닐 시 `SealError`. 또는 emit 코드에 비-string 키 만나면 throw 추가. 결정: **seal 시점 차단** (정적 보장). | `src/seal/seal.ts` typedef 처리 + `serialize-builder.ts:254` |
| W9 | N-6 fix: `mergeInheritance` 의 validation dedup 을 `ruleName` 비교로 변경 — child 가 같은 ruleName 재선언 시 부모 룰 폐기, 자식 룰만 유지. | `src/seal/seal.ts:320` |
| W10 | F-8 fix: `/[A-Z0-9]{9}/i` → `/^[A-Z0-9]{9}$/i`. | `src/rules/locales.ts:191` |
| W11 | F-9 fix: MAGNET_URI_RE 끝에 `$` 또는 magnet query string trailer 패턴 추가. | `src/rules/string.ts:1061` |
| W12 | H-1: `src/functions/_run-sealed.ts` 삭제 + `test/e2e/change-coverage.test.ts` 재작성 (public 함수로). | 2 files |
| W13 | API 추가: **manual `seal()` + auto-seal 제거**. `_autoSeal` / `_sealOnDemand` 의 자동 trigger 분기 제거. `_ensureSealed` 가 미실링 시 `SealError('not sealed — call seal() at app startup')` throw. `seal(...classes?)` 신규 public export (idempotent). | `src/seal/seal.ts`, `src/functions/*.ts`, `index.ts` |
| W14 | API 추가: **6 strict 함수** `validateSync` / `validateAsync` / `deserializeSync` / `deserializeAsync` / `serializeSync` / `serializeAsync`. Sync 변형은 sealed 의 해당 비트 (`_isAsync` / `_isSerializeAsync`) 가 true 면 `SealError`. Async 변형은 항상 Promise (sync 결과는 `Promise.resolve` wrap). | `src/functions/{validate,deserialize,serialize}.ts`, `index.ts` |
| W15 | docs: README 에 (a) manual `seal()` 사용법 (b) 6 strict 함수 권장 + 기존 통합 API 호환성 (c) `@Field` 4 valid 형태 (d) 미데코 필드 contract (F-6) (e) async-in-sync 시 `instanceof Promise` 분기. CHANGELOG: 모든 breaking 마이그레이션 한 줄씩. | README, CHANGELOG |
| W16 | 테스트 회귀 보강 (현재 valid 분기인데 미커버): (a) custom plan 3+ child + self-comparison strip / (b) `isNumberString({no_symbols:true})` / (c) field 에 3+ transforms / (d) async serialize transform + Set/Map collection / discriminator each. | `test/e2e/*` 4 신규 파일 |
| cleanup | 4 unreachable overload 삭제 (validate.ts 2개, deserialize.ts 1개, serialize.ts 1개). | **완료** (이전 세션) |

---

## 3. Migration (breaking changes — 사용자가 영향 받는 모든 항목)

CHANGELOG 의 마이그레이션 표가 이 표를 그대로 반영.

| ID | Before | After | 사용자 조치 |
|---|---|---|---|
| W4 | per-call `{stopAtFirstError:true}` 등 silent drop | `SealError` throw | per-call 인자에서 제거, `configure({...})` 로 이동 |
| W5 | `@Field(isNumber)` 가 codegen 까지 진행 → cryptic | `SealError` at decoration | `isNumber()` 호출 또는 4 valid 형태 중 선택 |
| W2 (D7) | 잘못된 discriminator / Set without setValue / Map without mapValue / 상속 충돌 / async-in-sync → silent 부분동작 또는 cryptic | `SealError` at first `seal()` | 설정 수정 |
| W2 (async-in-sync) | async 룰 1개 있어도 silent flip | seal 시점 message 명시 (현 동작 유지, throw 안 함; warn 또는 detection 메시지 결정 필요) | sync 가정한 caller 가 `instanceof Promise` 분기 추가 |
| W7 | input prototype 속성이 결과에 흘러감 (N-4) | `Object.hasOwn` 검사로 own property 만 추출 | input 객체 prototype 에 의도적으로 필드 둔 패턴 깨짐 — 의도된 필드는 own property 로 |
| W8 | Map 비-string 키 silent stringify (N-9) | seal 시점 `SealError` (또는 런타임 throw) | Map 키 타입 명시: `Map<string,V>` 또는 `Map<number,V>` |
| W6 | 일부 코드가 동시 deserialize 에서 false `circular` (N-3) | 호출당 새 WeakSet — false positive 0 | 없음 (silent fix) |
| W10/W11 | FR passport / magnet URI partial match 통과 | 완전 match 만 통과 | 이전에 통과하던 비정상 입력 fail — 입력 검증 강화로 환영 |
| W13 | 첫 `deserialize`/`serialize`/`validate` 호출에 auto-seal | `seal()` 명시 호출 필수, 미실링 시 throw | app entry 에 `seal()` 한 줄 추가 |
| W14 | `validate`/`deserialize`/`serialize` 만 존재 (union 반환) | 기존 3 + 6 strict 함수 추가 (기존은 호환) | 신규 코드는 strict 권장; 기존 코드 무변경 |

---

## 4. Out of scope (명시적 폐기)

이전 라운드에서 검토되었으나 **하지 않기로** 결정한 항목. 재논의 방지 목적.

- **에러 클래스 계층 재설계** (abstract `BakerError` + `UsageError` + `ExecutionError` + closed code unions + 20-site migration + `docs/errors.md`) — D1-D9 와 무관. 기존 `SealError extends Error { constructor(message) }` 그대로 사용.
- **`interface BakerError` → `BakerFieldError` rename** — 충돌 없음.
- **`isBakerError` → `isBakerErrors` rename** — 의미 변경 없음.
- **Rule string brand `__baker: 'rule' | 'factory'`** — W5 의 `.emit` + `.ruleName` 구조 검사로 충분. 듀얼 인스톨 위험은 `EmittableRule` 이 structural interface 라 자연 안전.
- **`DtoCtor` 2-bit brand stamping / `sealSync(Cls)` helper** — W14 의 6 strict 함수가 함수 명으로 명시 가능. brand 불필요.
- **`baker generate` codegen `.d.ts`** — freshness 문제 + setup 비용. 런타임 SealError 가 같은 시점에 catch.
- **Bun preload typegen / tsserver plugin / ESLint plugin** — 위 codegen 없으니 무의미.
- **`getDtoMode(Cls)` introspection** — 통합 `validate(Cls, x)` 가 내부에서 자동 dispatch. 프레임워크는 `instanceof Promise` 한 줄로 처리.
- **`strictUndecorated` 옵션 / D8 detection** — `new Class()` probe 없이 런타임 enumeration 불가. baker contract 로 README 에 명시 (F-6).
- **마이그레이션 가이드 (`from-class-validator.md`, `from-zod.md`, 등)** — onboarding 마케팅. plan scope 밖.
- **Recipes 문서 / framework 예제 / openapi 컴패니언 패키지** — 동일. plan scope 밖.

---

## 5. 거짓 양성 (검증 후 결함 아님 — 재조사 방지)

| 의심 | 결론 | 근거 |
|---|---|---|
| ReDoS catastrophic backtracking | 부정 | `/tmp/codex-baker-verify/n12-regex-time.ts` — email/IPv6/base64/locale 200-char near-miss 모두 50 ms 미만 |
| WeakSet/Map 메모리 누수 | 부정 | `globalRegistry.clear()` (seal.ts:108), `_sealedClasses.clear()` (seal.ts:146), 생성된 코드의 `try {} finally { _refs[i].delete(input); }` (deserialize-builder.ts:198-200) 모두 정상 |
| codegen JS injection (rule name / fieldKey) | 부정 | `sanitizeKey` (codegen-utils.ts:6) + `JSON.stringify` 가 모든 사용처에서 escape. `/tmp/codex-baker-verify/n5-codegen-injection.ts` 정상 |
| 검증 결과 순서 불안정 | 부정 | `Object.entries(merged)` 가 선언 순서 보존. `/tmp/codex-baker-verify/n8-ordering.ts` |
| thenable / Promise-non-async 우회 | 부정 | `isPromiseLike` (utils.ts:7-12) 가 then 메서드만 보고 거부. `/tmp/codex-baker-verify/n10-promise-nonasync.ts`, `n11-thenable.ts` 모두 throw |
| 4 미커버 분기 = dead code | 부정 (정정) | 각 라인 직접 읽음: (a) `rule-plan.ts:93` defensive 3+ child fallback / (b) `string.ts:195-196` `isNumberString({no_symbols:true})` public 옵션 / (c) `deserialize-builder.ts:441-446` N≥3 transforms generic loop (1/2 unroll 의 fallback) / (d) `serialize-builder.ts:230,317,326-327` async serialize codegen. 모두 valid 기능. W16 으로 회귀 테스트 보강 |

---

## 6. 실행 순서

```
Day 1   W12 cleanup, W10/W11 (regex 2줄), W3 (메시지 1줄), W9 (mergeInheritance dedup)
Day 2   W4 + W5 (validate-meta 호출 + parseFieldArgs 모양 검사 + _check-call-options)
Day 3   W2 (validate-meta.ts 신규 — discriminator/Set·Map/상속/async-in-sync)
Day 4   W1 (collectionValue walk), W6 (WeakSet 호출당 생성), W7 (Object.hasOwn)
Day 5   W13 (manual seal + auto 제거), W14 (6 strict 함수)
Day 6   W15 docs + CHANGELOG, W16 회귀 테스트, W8 (Map 키 정책 결정 후 적용)
```

각 day 의 acceptance:
- `bun test` 통과 (기존 2045+ pass 유지)
- `bench/*` 의 simple/nested/error 시나리오 ±3% 이내 (sync 핫패스 보호)
- 신규 회귀 테스트 추가분 모두 통과

---

## 7. Rollback

각 W 가 독립 revertable. cascade 위험:
- W13 (manual seal) 단독 revert 시 W14 의 strict 함수가 seal 미보장 상태 호출 가능 → 함께 revert.
- W2 (validate-meta) revert 시 D7 silent 동작 복귀 — 데이터 무결성 영향 없으나 사용자 디버깅 비용 증가.
- 나머지 W1/W3-W11 은 독립 revert 안전.

기준: 어느 W 의 PR 이 `bench/*` 의 simple-valid 또는 simple-invalid 시나리오 ±3% 초과 → revert + 재시도.

---

## 8. 결정 사항 (확정)

- **W2 async-in-sync**: seal-time 검사는 false-positive 다수 — 채택하지 않음. 대신 W14 strict 변형(`validateSync` / `deserializeSync` / `serializeSync`)이 호출 시점에 `_isAsync` / `_isSerializeAsync` 확인하여 `SealError` throw.
- **W8 Map 키**: `Map<string, V>` 만 지원. serialize codegen 이 비-string 키 만나면 `TypeError` throw (data shape error). README 명시.
- **F-6 미데코 필드**: README 만 — "baker 는 `@Field` 데코된 필드만 처리. 그 외 필드는 DTO 대상 아님". console.warn 없음.

---

## 9. 산출물 (재현 + 검증)

모든 결함과 거짓 양성은 다음 경로의 fixture 로 검증됨. 회귀 테스트 작성 시 참조.

```
/tmp/baker-verify/
  cir-set.ts            F-1
  d7-disc.ts            F-2, F-3
  n3-race-mine.ts       N-3
  silent-drops.ts       F-4
  n4-proto-mine.ts      N-4
  n9-map-mine.ts        N-9
  n6-inh-mine.ts        N-6
  fr-passport.ts        F-8
  f9-magnet.ts          F-9
  f10-latitude.ts       F-10 (코드 스멜)
  d1-d9-symptoms.ts     F-6, F-7

/tmp/codex-baker-verify/
  n5-codegen-injection.ts   injection 부정
  n8-ordering.ts            ordering 부정
  n10-promise-nonasync.ts   Promise non-async 거부
  n11-thenable.ts           thenable 거부
  n12-regex-time.ts         ReDoS 부정
  f5-ts-level.ts            F-5 TS catch
  f5-rule-factory-misuse.ts F-5 factory misuse
```

W16 으로 `test/e2e/` 에 영구 이관.
