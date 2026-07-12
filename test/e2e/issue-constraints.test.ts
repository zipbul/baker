import { describe, it, expect } from 'bun:test';

import { Baker, Field } from '../../index';
import { arrayOf } from '../../src/decorators/field';
import { isString, isNumber, min, minLength, length, arrayContains } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';

const baker = new Baker();

// ── Interaction axis: field-level message/context × rule constraints (the v1 defect) ──

@baker.Recipe
class FieldMsgParent {
  @Field(isString, { message: 'parent message', context: { from: 'parent' } })
  name!: string;
}

@baker.Recipe
class FieldMsgChild extends FieldMsgParent {
  // Child re-declares with a CONSTRAINED rule and NO own message → inherits parent field
  // message/context; the issue must carry BOTH the inherited message/context AND constraints.
  @Field(isString, minLength(3))
  override name = '';
}

@baker.Recipe
class RuleMsgDto {
  // Rule/field message present AND a constrained rule → message wins, constraints still attach.
  @Field(isString, minLength(3), { message: 'bad name' })
  name!: string;
}

let fnConstraintsArg: unknown;

@baker.Recipe
class FieldMsgFnDto {
  // Message FUNCTION declared WITH the rule → copied onto the rule; its fn receives the rule's own
  // constraints (current behavior), and the issue carries them.
  @Field(isString, minLength(3), {
    message: args => {
      fnConstraintsArg = args.constraints;
      return 'fn message';
    },
  })
  name!: string;
}

let inheritedFnConstraintsArg: unknown;

@baker.Recipe
class InheritedFnParent {
  @Field(isString, {
    message: args => {
      inheritedFnConstraintsArg = args.constraints;
      return 'inherited fn';
    },
  })
  name!: string;
}

@baker.Recipe
class InheritedFnChild extends InheritedFnParent {
  // Child adds a constrained rule, NO own message → the parent's field-level message fn is inherited
  // via meta.message (a field fallback), so it receives {} as constraints, not the rule's.
  @Field(isString, minLength(3))
  override name = '';
}

@baker.Recipe
class NumberDto {
  @Field(isNumber(), min(5)) age!: number;
}

@baker.Recipe
class StringDto {
  @Field(isString, minLength(2)) name!: string;
}

@baker.Recipe
class RangeDto {
  @Field(isString, length(2, 4)) code!: string;
}

@baker.Recipe
class TypeCheckDto {
  @Field(isString) name!: string;
}

@baker.Recipe
class InnerDto {
  @Field(isNumber(), min(10)) score!: number;
}

@baker.Recipe
class OuterDto {
  @Field({ type: () => InnerDto }) inner!: InnerDto;
}

@baker.Recipe
class ArrayDto {
  @Field(arrayOf(isString, minLength(3))) tags!: string[];
}

@baker.Recipe
class GateDepDto {
  // `min` is the typed dependency (no explicit isNumber): it drives the type gate itself.
  @Field(min(5)) age!: number;
}

const callerRoles = ['admin'];

@baker.Recipe
class ArrayContainsDto {
  @Field(arrayContains(callerRoles)) roles!: string[];
}

const collectBaker = new Baker({ stopAtFirstError: false });

@collectBaker.Recipe
class CollectDto {
  @Field(isNumber(), min(5)) age!: number;
  @Field(isString, minLength(2)) name!: string;
}

baker.seal();
collectBaker.seal();

describe('BakerIssue constraints', () => {
  it('should include the failing rule constraints on a number rule issue', () => {
    const result = baker.deserializeSync(NumberDto, { age: 1 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('min');
    expect(result.errors[0]!.constraints).toEqual({ min: 5 });
  });

  it('should include the failing rule constraints on a string-length rule issue', () => {
    const result = baker.deserializeSync(StringDto, { name: 'a' });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('minLength');
    expect(result.errors[0]!.constraints).toEqual({ min: 2 });
  });

  it('should include multi-key constraints (length min+max)', () => {
    const result = baker.deserializeSync(RangeDto, { code: 'x' });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('length');
    expect(result.errors[0]!.constraints).toEqual({ min: 2, max: 4 });
  });

  it('should NOT attach a constraints key when the rule stamps empty constraints', () => {
    const result = baker.deserializeSync(TypeCheckDto, { name: 42 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('isString');
    expect('constraints' in result.errors[0]!).toBe(false);
  });

  it('should carry constraints on a nested DTO field issue', () => {
    const result = baker.deserializeSync(OuterDto, { inner: { score: 3 } });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.path).toBe('inner.score');
    expect(result.errors[0]!.code).toBe('min');
    expect(result.errors[0]!.constraints).toEqual({ min: 10 });
  });

  it('should carry constraints on an array element (arrayOf) issue', () => {
    const result = baker.deserializeSync(ArrayDto, { tags: ['ab'] });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('minLength');
    expect(result.errors[0]!.constraints).toEqual({ min: 3 });
  });

  it('should carry constraints when the rule is the type gate dependency', () => {
    const result = baker.deserializeSync(GateDepDto, { age: 1 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('min');
    expect(result.errors[0]!.constraints).toEqual({ min: 5 });
  });

  it('should carry constraints on every issue in error-collection mode', () => {
    const result = collectBaker.deserializeSync(CollectDto, { age: 1, name: 'a' });
    assertBakerIssueSet(result);
    const byPath = Object.fromEntries(result.errors.map(e => [e.path, e.constraints]));
    expect(byPath['age']).toEqual({ min: 5 });
    expect(byPath['name']).toEqual({ min: 2 });
  });

  it('should keep inherited field message/context AND attach rule constraints', () => {
    const result = baker.deserializeSync(FieldMsgChild, { name: 'ab' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'minLength')!;
    expect(err.message).toBe('parent message');
    expect(err.context).toEqual({ from: 'parent' });
    expect(err.constraints).toEqual({ min: 3 });
  });

  it('should attach constraints alongside a field-level string message', () => {
    const result = baker.deserializeSync(RuleMsgDto, { name: 'ab' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'minLength')!;
    expect(err.message).toBe('bad name');
    expect(err.constraints).toEqual({ min: 3 });
  });

  it('should not change what a directly-declared message function receives, and still carry constraints', () => {
    fnConstraintsArg = 'unset';
    const result = baker.deserializeSync(FieldMsgFnDto, { name: 'ab' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'minLength')!;
    expect(err.message).toBe('fn message');
    expect(err.constraints).toEqual({ min: 3 });
    // A message declared with the rule (@Field(rule, {message})) is copied onto the rule, so its fn
    // receives the rule's own constraints — unchanged by the constraints-on-issue feature.
    expect(fnConstraintsArg).toEqual({ min: 3 });
  });

  it('should give an INHERITED field message function {} constraints (unchanged fallback behavior)', () => {
    inheritedFnConstraintsArg = 'unset';
    const result = baker.deserializeSync(InheritedFnChild, { name: 'ab' });
    assertBakerIssueSet(result);
    const err = result.errors.find(e => e.code === 'minLength')!;
    expect(err.message).toBe('inherited fn');
    expect(err.constraints).toEqual({ min: 3 });
    // Inherited via the merger onto meta.message (not the rule) → the fn is a field fallback → {}.
    expect(inheritedFnConstraintsArg).toEqual({});
  });

  it('should expose a frozen constraints object (no cross-call mutation)', () => {
    const result = baker.deserializeSync(NumberDto, { age: 1 });
    assertBakerIssueSet(result);
    const c = result.errors[0]!.constraints as Record<string, unknown>;
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('should deep-freeze nested constraint values so mutating an issue cannot corrupt later validation', () => {
    const first = baker.deserializeSync(ArrayContainsDto, { roles: [] });
    assertBakerIssueSet(first);
    const values = (first.errors[0]!.constraints as { values: string[] }).values;
    expect(Object.isFrozen(values)).toBe(true);
    // Attempting to mutate the shared array must not corrupt the rule; a fresh failure still reports.
    try {
      (values as string[]).length = 0;
    } catch {
      /* frozen array throws in strict mode — that is the point */
    }
    const second = baker.deserializeSync(ArrayContainsDto, { roles: [] });
    assertBakerIssueSet(second);
    expect(second.errors[0]!.code).toBe('arrayContains');
    expect((second.errors[0]!.constraints as { values: string[] }).values).toEqual(['admin']);
  });

  it('should NOT freeze the array the caller passed to the rule factory (no side effect)', () => {
    // The exposed constraints are a frozen clone; the caller's own array stays mutable.
    expect(Object.isFrozen(callerRoles)).toBe(false);
    const result = baker.deserializeSync(ArrayContainsDto, { roles: [] });
    assertBakerIssueSet(result);
    expect((result.errors[0]!.constraints as { values: string[] }).values).not.toBe(callerRoles);
  });
});
