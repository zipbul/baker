import { ensureMeta, collectType } from '../collect';
import { SealError } from '../errors';
import type { ValidationOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// @Nested — @Type + @ValidateNested 통합 데코레이터 (§Phase4)
// ─────────────────────────────────────────────────────────────────────────────

export interface NestedOptions {
  discriminator?: { property: string; subTypes: { value: Function; name: string }[] };
  keepDiscriminatorProperty?: boolean;
  each?: boolean;
}

/**
 * @Type(() => X) + @ValidateNested() 통합.
 *
 * discriminator + each 동시 사용 시 SealError throw.
 */
export function Nested(
  typeFn: () => new (...args: any[]) => any,
  options?: NestedOptions,
): PropertyDecorator {
  if (options?.discriminator && options?.each) {
    throw new SealError('@Nested: discriminator + each 동시 사용 불가');
  }

  return (target, key) => {
    // Type 메타데이터 저장
    collectType(target as object, key as string, {
      fn: typeFn,
      discriminator: options?.discriminator,
      keepDiscriminatorProperty: options?.keepDiscriminatorProperty,
    });

    // ValidateNested 플래그 저장
    const meta = ensureMeta((target as any).constructor, key as string);
    meta.flags.validateNested = true;
    if (options?.each) meta.flags.validateNestedEach = true;
  };
}
