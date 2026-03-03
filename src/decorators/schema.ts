import { collectSchema, collectClassSchema } from '../collect';
import type { JsonSchema202012 } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// @Schema() — JSON Schema 메타데이터 데코레이터 (§6.5, §6.6, §6.8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 객체 리터럴: ClassDecorator & PropertyDecorator.
 * 프로퍼티 레벨에서는 자동 매핑 결과를 오버라이드/보충.
 * 클래스 레벨에서는 루트 스키마에 title, description, $id 등 병합.
 */
export function Schema(schema: JsonSchema202012): ClassDecorator & PropertyDecorator;
/**
 * 함수형: PropertyDecorator 전용.
 * `auto` 파라미터로 자동 매핑 결과를 받아 완전한 제어 가능.
 * toJsonSchema() 호출 시점에 실행된다 (데코레이터 시점이 아님).
 */
export function Schema(fn: (auto: JsonSchema202012) => JsonSchema202012): PropertyDecorator;
export function Schema(
  schemaOrFn: JsonSchema202012 | ((auto: JsonSchema202012) => JsonSchema202012),
): any {
  return (target: any, key?: string | symbol) => {
    if (key !== undefined) {
      // Property decorator
      collectSchema(target as object, key as string, schemaOrFn as any);
    } else {
      // Class decorator — 함수형 불허
      if (typeof schemaOrFn === 'function') {
        throw new Error('@Schema(fn) function form is not supported at class level');
      }
      collectClassSchema(target as Function, schemaOrFn as Record<string, unknown>);
    }
  };
}
