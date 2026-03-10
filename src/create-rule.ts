import type { EmittableRule, EmitContext } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// createRule — 커스텀 검증 규칙 생성 Public API (§1.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRuleOptions {
  /** 규칙 이름. 에러 코드로 사용됨. */
  name: string;
  /** 검증 함수 — true: 통과, false: 실패. async 함수 허용 (Promise<boolean> 반환 시 자동으로 async 룰로 등록). */
  validate: (value: unknown) => boolean | Promise<boolean>;
  /** 룰 파라미터 — toJsonSchema 매핑에 사용 */
  constraints?: Record<string, unknown>;
  /** 이 룰이 전제하는 타입 — 타입 게이트 최적화에 사용 */
  requiresType?: 'string' | 'number' | 'boolean' | 'date';
}

/**
 * 사용자 정의 검증 규칙을 생성한다.
 *
 * @example
 * // 간단 형태
 * const koreanPhone = createRule('koreanPhone', (v) => /^01[016789]/.test(v as string));
 *
 * // 옵션 형태
 * const isEven = createRule({
 *   name: 'isEven',
 *   validate: (v) => typeof v === 'number' && v % 2 === 0,
 * });
 */
export function createRule(name: string, validate: (value: unknown) => boolean | Promise<boolean>): EmittableRule;
export function createRule(options: CreateRuleOptions): EmittableRule;
export function createRule(
  nameOrOptions: string | CreateRuleOptions,
  validateFn?: (value: unknown) => boolean | Promise<boolean>,
): EmittableRule {
  const name = typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions.name;
  const validate = typeof nameOrOptions === 'string' ? validateFn! : nameOrOptions.validate;
  const constraints = typeof nameOrOptions === 'object' ? nameOrOptions.constraints : undefined;
  const requiresType = typeof nameOrOptions === 'object' ? nameOrOptions.requiresType : undefined;

  // async 함수 여부 자동 감지
  const isAsyncFn = validate.constructor.name === 'AsyncFunction';

  // 검증 함수 래퍼 — validate에 직접 위임
  const fn = function (value: unknown): boolean | Promise<boolean> {
    return validate(value);
  } as EmittableRule;

  // .emit() — refs 배열을 통한 함수 호출 코드 생성
  fn.emit = function (varName: string, ctx: EmitContext): string {
    const i = ctx.addRef(validate);
    if (isAsyncFn) {
      return `if(!(await _refs[${i}](${varName}))) ${ctx.fail(name)};`;
    }
    return `if(!_refs[${i}](${varName})) ${ctx.fail(name)};`;
  };

  (fn as any).ruleName = name;
  (fn as any).isAsync = isAsyncFn;
  if (constraints) (fn as any).constraints = constraints;
  if (requiresType) (fn as any).requiresType = requiresType;

  return fn;
}
