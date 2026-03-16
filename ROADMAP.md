# Baker 기능 로드맵

> 작성일: 2026-03-16
> 대상: @zipbul/baker
> 목적: class-transformer + class-validator 완전 대체를 위한 기능 갭 및 향후 계획

---

## class-transformer 대비 기능 갭

### `instanceToInstance` (deep clone)

class-transformer의 `instanceToInstance(instance)` — 클래스 인스턴스를 serialize → deserialize 사이클로 deep clone.

`clone(instance)` 함수 추가 — `deserialize(Class, await serialize(instance))`의 shorthand.

### version-based filtering (`since`/`until`)

class-transformer의 `@Expose({ since: 1, until: 3 })` — API 버전별 필드 노출.

`@Field({ since: 1, until: 3 })` 옵션 추가 + `deserialize(Cls, input, { version: 2 })`.

### class-level `@Exclude()` strategy

class-transformer의 `@Exclude()` at class level → "excludeAll" 전략. 명시적 `@Expose()` 없는 필드는 모두 제외.

`@Schema({ strategy: 'excludeAll' })` 또는 `configure({ strategy: 'excludeAll' })` 옵션 추가.

### `targetMaps`

데코레이터를 붙일 수 없는 외부 클래스를 위한 글로벌 타입 맵.

`configure({ targetMaps: [{ target: ExternalClass, properties: { ... } }] })`.

### `ignoreDecorators`

모든 데코레이터를 무시하고 raw transformation 수행. 사용 빈도 매우 낮음.

`deserialize(Cls, input, { ignoreDecorators: true })`.

### synchronous API

baker의 `deserialize()`/`serialize()`는 항상 async. class-transformer는 동기. async transform이 없는 DTO에서 불필요한 Promise 오버헤드 발생.

seal 시 async 분석 결과에 따라:
- async transform이 없는 DTO → `deserializeSync()` / `serializeSync()` 제공
- 또는 `deserialize()`가 async 불필요 시 내부적으로 sync 경로 사용하되 반환은 `Promise.resolve()`로 wrapping

### Map/Set transformation

현재 Map/Set은 validation(`each: true`)만 지원. `plain object → Map`, `Map → plain object` 변환은 수동 `@Field({ transform })` 필요.

`@Field({ type: () => Map, mapKey: () => String, mapValue: () => Number })` 형태의 자동 변환 지원.

---

## class-validator 대비 기능 갭

### `@IsTimeZone`

IANA timezone string 검증 (`"America/New_York"` 등).

`Intl.supportedValuesOf('timeZone')` 기반 구현 추가.

### stateful custom validator (DI 지원)

class-validator의 `@ValidatorConstraint()` + `ValidatorConstraintInterface` — NestJS DI를 통한 서비스 주입 가능.

`createRule`에 factory 패턴 추가:
```typescript
createRule('isUniqueEmail', {
  factory: (container) => container.get(UserService),
  validate: (service, value) => service.isEmailAvailable(value),
});
```

### custom error message per-field

내부 `RuleDef.message` / `RuleDef.context` 필드는 존재하지만, `@Field()` 공개 API에 `message` 옵션이 노출되지 않음.

`@Field(isEmail(), { message: 'Invalid email' })` 또는 `@Field(isEmail({ message: 'Invalid email' }))` 형태로 노출.

### `ValidationError` 트리 구조

class-validator: `{ target, property, value, constraints: { ruleName: message }, children: ValidationError[] }`
baker: `{ path: 'address.street', code: 'isString', message?, context? }` — flat path 문자열, target/value 없음, 트리 구조 없음.

호환 모드 옵션:
```typescript
deserialize(Cls, input, { errorFormat: 'tree' })  // class-validator 호환 트리 구조
deserialize(Cls, input, { errorFormat: 'flat' })   // 기본 (현재 동작)
```

### global `skipMissingProperties` / `skipNullProperties`

현재 per-field `optional`/`nullable`만 지원. 글로벌 옵션 없음.

`configure({ skipMissingProperties: true })` — 모든 필드에 `optional: true`를 암시적으로 적용.

### `forbidUnknownValues` (strict object rejection)

unknown 필드를 에러로 거부하는 모드. 현재 `stripUnknown`이 이 역할을 하지만 이름이 불일치(REVIEW.md C-10 참조).

C-10에서 옵션을 분리하면 해결.

### `@Allow`

필드를 validation 없이 "허용"으로만 표시. whitelist 모드에서 필요.

`@Field()` (룰 없이 호출)이 이미 동일한 역할을 수행. 문서화로 충분.
