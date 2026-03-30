import { isErr } from '@zipbul/result';
import { _toBakerErrors } from '../errors';
import { _ensureSealed } from '../seal/seal';
import type { BakerError, BakerErrors } from '../errors';
import type { RuntimeOptions } from '../interfaces';

/**
 * @internal — shared seal+dispatch+unwrap for deserialize and validate.
 * Calls sealed._deserialize, converts Result to BakerErrors, maps success via onSuccess.
 */
export function _runSealed<S>(
  Class: Function,
  input: unknown,
  options: RuntimeOptions | undefined,
  onSuccess: (result: any) => S,
): S | BakerErrors | Promise<S | BakerErrors> {
  const sealed = _ensureSealed(Class);
  if (sealed._isAsync) {
    return (sealed._deserialize(input, options) as Promise<any>).then(
      (result: any): S | BakerErrors => {
        if (isErr(result)) return _toBakerErrors(result.data as BakerError[]);
        return onSuccess(result);
      },
    );
  }
  const result = sealed._deserialize(input, options);
  if (isErr(result)) return _toBakerErrors(result.data as BakerError[]);
  return onSuccess(result);
}
