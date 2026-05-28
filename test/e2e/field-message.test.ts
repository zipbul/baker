import { describe, it, expect, afterEach, beforeEach } from 'bun:test';

import { Field, Recipe, deserialize, seal, configure } from '../../index';
import { arrayOf } from '../../src/decorators/field';
import { isString, minLength, isNumber, isInt } from '../../src/rules/index';
import { assertBakerIssueSet } from '../integration/helpers/assert';
import { sealClass } from '../integration/helpers/seal';
import { unseal } from '../integration/helpers/unseal';

beforeEach(() => seal());
afterEach(() => unseal());

// ─── DTOs ────────────────────────────────────────────────────────────────────

@Recipe
class StringMessageDto {
  @Field(isString, minLength(3), { message: 'Name is invalid' })
  name!: string;
}

@Recipe
class FunctionMessageDto {
  @Field(isString, {
    message: ({ property, value }) => `${property} got bad value: ${JSON.stringify(value)}`,
  })
  email!: string;
}

@Recipe
class ContextDto {
  @Field(isString, { context: { severity: 'warning', field: 'tag' } })
  tag!: string;
}

@Recipe
class MessageAndContextDto {
  @Field(isNumber(), { message: 'Must be a number', context: { hint: 'use integer' } })
  count!: number;
}

@Recipe
class MultiRuleMessageDto {
  @Field(isString, minLength(5), { message: 'Username invalid' })
  username!: string;
}

@Recipe
class ArrayOfMessageDto {
  @Field(arrayOf(isString, minLength(1)), { message: 'Each tag must be a non-empty string' })
  tags!: string[];
}

@Recipe
class NoMessageDto {
  @Field(isString)
  name!: string;
}

@Recipe
class FalsyContextZeroDto {
  @Field(isString, { context: 0 })
  value!: string;
}

@Recipe
class FalsyContextFalseDto {
  @Field(isString, { context: false })
  value!: string;
}

@Recipe
class FalsyContextEmptyStringDto {
  @Field(isString, { context: '' })
  value!: string;
}

@Recipe
class EmptyStringMessageDto {
  @Field(isString, { message: '' })
  value!: string;
}

@Recipe
class ConstraintsAccessDto {
  @Field(minLength(5), {
    message: ({ property, constraints }) => `${property} must be at least ${constraints['min']} chars`,
  })
  name!: string;
}

@Recipe
class InnerMsgDto {
  @Field(isString, { message: 'inner msg' })
  name!: string;
}

@Recipe
class OuterMsgDto {
  @Field({ type: () => InnerMsgDto })
  child!: InnerMsgDto;
}

@Recipe
class InnerCtxDto {
  @Field(isNumber(), { message: 'must be number', context: { severity: 'error' } })
  age!: number;
}

@Recipe
class OuterCtxDto {
  @Field({ type: () => InnerCtxDto })
  nested!: InnerCtxDto;
}

@Recipe
class InnerArrayMsgDto {
  @Field(isString, { message: 'item msg' })
  label!: string;
}

@Recipe
class OuterArrayMsgDto {
  @Field({ type: () => [InnerArrayMsgDto] })
  items!: InnerArrayMsgDto[];
}

@Recipe
class GroupsWithMessageDto {
  @Field(isString, { groups: ['admin'], message: 'Admin field invalid' })
  secret!: string;

  @Field(isNumber())
  id!: number;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('@Field message option — string', () => {
  it('validation failure includes string in BakerIssue.message', async () => {
    const result = await deserialize(StringMessageDto, { name: 42 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toBe('Name is invalid');
  });

  it('minLength failure also includes message', async () => {
    const result = await deserialize(StringMessageDto, { name: 'ab' });
    assertBakerIssueSet(result);
    const minLenErr = result.errors.find(e => e.code === 'minLength');
    expect(minLenErr).toBeDefined();
    expect(minLenErr!.message).toBe('Name is invalid');
  });
});

describe('@Field message option — function', () => {
  it('validation failure calls function for dynamic message', async () => {
    const result = await deserialize(FunctionMessageDto, { email: 123 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toBe('email got bad value: 123');
  });
});

describe('@Field context option', () => {
  it('validation failure includes value in BakerIssue.context', async () => {
    const result = await deserialize(ContextDto, { tag: 999 });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.context).toEqual({ severity: 'warning', field: 'tag' });
  });
});

describe('@Field message + context used together', () => {
  it('both message and context included in error', async () => {
    const result = await deserialize(MessageAndContextDto, { count: 'not a number' });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toBe('Must be a number');
    expect(result.errors[0]!.context).toEqual({ hint: 'use integer' });
  });
});

describe('@Field message — applied to all rules uniformly', () => {
  it('same message applied to all rule failures for the field', async () => {
    const result = await deserialize(MultiRuleMessageDto, { username: 42 });
    assertBakerIssueSet(result);
    for (const error of result.errors) {
      expect(error.message).toBe('Username invalid');
    }
  });
});

describe('@Field message — used with arrayOf', () => {
  it('message applied to each rule failures', async () => {
    const result = await deserialize(ArrayOfMessageDto, { tags: ['valid', '', 42] });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const error of result.errors) {
      expect(error.message).toBe('Each tag must be a non-empty string');
    }
  });
});

describe('@Field message not set', () => {
  it('error object does not have message property', async () => {
    const result = await deserialize(NoMessageDto, { name: 42 });
    assertBakerIssueSet(result);
    expect('message' in result.errors[0]!).toBe(false);
  });

  it('error object does not have context property', async () => {
    const result = await deserialize(NoMessageDto, { name: 42 });
    assertBakerIssueSet(result);
    expect('context' in result.errors[0]!).toBe(false);
  });
});

describe('@Field context — falsy value handling', () => {
  it('context: 0 → 0 included in error', async () => {
    const result = await deserialize(FalsyContextZeroDto, { value: 42 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.context).toBe(0);
  });

  it('context: false → false included in error', async () => {
    const result = await deserialize(FalsyContextFalseDto, { value: 42 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.context).toBe(false);
  });

  it('context: "" → empty string included in error', async () => {
    const result = await deserialize(FalsyContextEmptyStringDto, { value: 42 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.context).toBe('');
  });
});

describe('@Field message — empty string', () => {
  it('message: "" → empty string included in error', async () => {
    const result = await deserialize(EmptyStringMessageDto, { value: 42 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.message).toBe('');
  });
});

describe('@Field message function — constraints access', () => {
  it('reads rule parameters from constraints object', async () => {
    const result = await deserialize(ConstraintsAccessDto, { name: 'ab' });
    assertBakerIssueSet(result);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain('5');
  });
});

describe('nested DTO error — message propagation', () => {
  it('should preserve message from nested DTO validation errors', async () => {
    const result = await deserialize(OuterMsgDto, { child: { name: 42 } });
    assertBakerIssueSet(result);
    const childErr = result.errors.find(e => e.path.startsWith('child.'));
    expect(childErr).toBeDefined();
    expect(childErr!.message).toBe('inner msg');
  });
});

describe('nested DTO error — context propagation', () => {
  it('should preserve message and context from nested DTO validation errors', async () => {
    const result = await deserialize(OuterCtxDto, { nested: { age: 'not a number' } });
    assertBakerIssueSet(result);
    const nestedErr = result.errors.find(e => e.path.startsWith('nested.'));
    expect(nestedErr).toBeDefined();
    expect(nestedErr!.message).toBe('must be number');
    expect(nestedErr!.context).toEqual({ severity: 'error' });
  });
});

describe('nested DTO array error — message propagation', () => {
  it('should preserve message from nested array DTO validation errors', async () => {
    const result = await deserialize(OuterArrayMsgDto, { items: [{ label: 42 }] });
    assertBakerIssueSet(result);
    const itemErr = result.errors.find(e => e.path.startsWith('items['));
    expect(itemErr).toBeDefined();
    expect(itemErr!.message).toBe('item msg');
  });
});

describe('@Field message + groups combination', () => {
  it('groups match → message included', async () => {
    const result = await deserialize(GroupsWithMessageDto, { secret: 42, id: 1 }, { groups: ['admin'] });
    assertBakerIssueSet(result);
    const secretErr = result.errors.find(e => e.path === 'secret');
    expect(secretErr).toBeDefined();
    expect(secretErr!.message).toBe('Admin field invalid');
  });

  it('groups mismatch → field itself excluded → no error', async () => {
    const result = (await deserialize(
      GroupsWithMessageDto,
      { secret: 42, id: 1 },
      { groups: ['viewer'] },
    )) as GroupsWithMessageDto;
    expect((result as GroupsWithMessageDto & { secret?: unknown }).secret).toBeUndefined();
    expect(result.id).toBe(1);
  });
});

// ─── type-gate failures must carry the field's context/message (regression) ───
// Repro: a requiresType rule that is NOT a type asserter (e.g. isInt → 'number')
// owns the field's type gate. Gate-level rejections (NaN, wrong typeof) must carry
// the same context/message as rule-body rejections (e.g. Infinity).

@Recipe
class MaxAgeDto {
  @Field(isInt, { context: { reason: 'invalid_max_age' } })
  maxAge!: number;
}

@Recipe
class MaxAgeMsgDto {
  @Field(isInt, { message: 'maxAge must be an integer' })
  maxAge!: number;
}

@Recipe
class MaxAgeNoCtxDto {
  @Field(isInt)
  maxAge!: number;
}

@Recipe
class MinLenCtxDto {
  @Field(minLength(3), { context: { reason: 'too_short_or_wrong_type' } })
  name!: string;
}

@Recipe
class AsserterCtxDto {
  @Field(isString, minLength(3), { context: { reason: 'name_invalid' } })
  name!: string;
}

describe('type-gate failures carry field context/message', () => {
  it('isInt gate rejection (NaN) includes context — matches Infinity', async () => {
    const result = await deserialize(MaxAgeDto, { maxAge: NaN });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('isInt');
    expect(result.errors[0]!.context).toEqual({ reason: 'invalid_max_age' });
  });

  it('isInt rule-body rejection (Infinity) includes context — regression guard', async () => {
    const result = await deserialize(MaxAgeDto, { maxAge: Infinity });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('isInt');
    expect(result.errors[0]!.context).toEqual({ reason: 'invalid_max_age' });
  });

  it('isInt gate rejection (non-number) includes context', async () => {
    const result = await deserialize(MaxAgeDto, { maxAge: 'abc' });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('isInt');
    expect(result.errors[0]!.context).toEqual({ reason: 'invalid_max_age' });
  });

  it('isInt gate rejection (NaN) includes message', async () => {
    const result = await deserialize(MaxAgeMsgDto, { maxAge: NaN });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.message).toBe('maxAge must be an integer');
  });

  it('generalizes to a non-asserter string rule (minLength) on wrong type', async () => {
    const result = await deserialize(MinLenCtxDto, { name: 123 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('minLength');
    expect(result.errors[0]!.context).toEqual({ reason: 'too_short_or_wrong_type' });
  });

  it('asserter-owned gate still carries context (no regression)', async () => {
    const result = await deserialize(AsserterCtxDto, { name: 123 });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.context).toEqual({ reason: 'name_invalid' });
  });

  it('a field without context produces no context key on gate failure (fix is inert)', async () => {
    const result = await deserialize(MaxAgeNoCtxDto, { maxAge: NaN });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('isInt');
    expect(result.errors[0]!.context).toBeUndefined();
  });

  it('carries context on the gate failure in stopAtFirstError mode too', async () => {
    unseal(); // beforeEach already sealed with defaults; reconfigure before re-sealing
    configure({ stopAtFirstError: true });
    seal();
    @Recipe
    class StopMaxAgeDto {
      @Field(isInt, { context: { reason: 'invalid_max_age' } })
      maxAge!: number;
    }
    sealClass(StopMaxAgeDto);
    const result = await deserialize(StopMaxAgeDto, { maxAge: NaN });
    assertBakerIssueSet(result);
    expect(result.errors[0]!.code).toBe('isInt');
    expect(result.errors[0]!.context).toEqual({ reason: 'invalid_max_age' });
  });
});

// ─── field-level context must reach EVERY field-own-path failure, not just rules ───
// Root-cause coverage: context/message is field-level, so the type gate, required-missing
// (isDefined), structural array/object gates, and conversion failures must all carry it —
// while descendant (element/nested-child) failures keep their OWN context.

@Recipe
class ChildNameDto {
  @Field(isString) name!: string;
}

@Recipe
class RequiredCtxDto {
  @Field(isString, { context: { reason: 'name_required' } })
  name!: string;
}

@Recipe
class ArrayCtxDto {
  @Field(arrayOf(isString), { context: { reason: 'must_be_array' } })
  items!: string[];
}

@Recipe
class TypeOnlyCtxDto {
  @Field({ type: () => ChildNameDto, context: { reason: 'child_must_be_object' } })
  child!: ChildNameDto;
}

@Recipe
class ChildCtxDto {
  @Field(isString, { context: { reason: 'child_name_invalid' } })
  name!: string;
}

@Recipe
class ParentCtxDto {
  @Field({ type: () => ChildCtxDto, context: { reason: 'parent_child_invalid' } })
  child!: ChildCtxDto;
}

@Recipe
class ArrayMsgDto {
  @Field(arrayOf(isString), { message: 'items must be an array' })
  items!: string[];
}

@Recipe
class SetCtxDto {
  @Field({ type: () => Set, setValue: () => ChildNameDto, context: { reason: 'must_be_set' } })
  items!: Set<ChildNameDto>;
}

@Recipe
class SetElemCtxDto {
  @Field(arrayOf(isString), { type: () => Set, context: { reason: 'set_elem_invalid' } })
  tags!: Set<string>;
}

@Recipe
class GateMsgFnDto {
  @Field(isInt, { message: ({ property }) => `${property} must be an integer` })
  maxAge!: number;
}

@Recipe
class DiscDogDto {
  @Field(isString) breed!: string;
}

@Recipe
class DiscCatDto {
  @Field(isString) sound!: string;
}

@Recipe
class DiscCtxDto {
  @Field({
    type: () => DiscDogDto,
    discriminator: {
      property: 'type',
      subTypes: [
        { value: DiscDogDto, name: 'dog' },
        { value: DiscCatDto, name: 'cat' },
      ],
    },
    context: { reason: 'pet_invalid' },
  })
  pet!: DiscDogDto | DiscCatDto;
}

const reasonOf = (c: unknown): string | undefined => (c as { reason?: string } | undefined)?.reason;

describe('field context reaches all field-own-path failures', () => {
  it('required-missing (isDefined) carries field context', async () => {
    const result = await deserialize(RequiredCtxDto, {});
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'isDefined');
    expect(e).toBeDefined();
    expect(e!.context).toEqual({ reason: 'name_required' });
  });

  it('structural array gate (non-array) carries field context', async () => {
    const result = await deserialize(ArrayCtxDto, { items: 'not-an-array' });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'isArray');
    expect(e).toBeDefined();
    expect(e!.context).toEqual({ reason: 'must_be_array' });
  });

  it('type-only field structural object gate (non-object) carries field context', async () => {
    const result = await deserialize(TypeOnlyCtxDto, { child: 42 });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'isObject');
    expect(e).toBeDefined();
    expect(e!.context).toEqual({ reason: 'child_must_be_object' });
  });

  it('conversion failure (conversionFailed) carries field context', async () => {
    unseal();
    configure({ autoConvert: true });
    seal();
    @Recipe
    class ConvCtxDto {
      @Field(isInt, { context: { reason: 'maxage_bad' } })
      maxAge!: number;
    }
    sealClass(ConvCtxDto);
    const result = await deserialize(ConvCtxDto, { maxAge: {} });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'conversionFailed');
    expect(e).toBeDefined();
    expect(e!.context).toEqual({ reason: 'maxage_bad' });
  });

  it('descendant child failure keeps ITS OWN context, not the parent field context', async () => {
    const result = await deserialize(ParentCtxDto, { child: { name: 42 } });
    assertBakerIssueSet(result);
    expect(result.errors.some(x => reasonOf(x.context) === 'child_name_invalid')).toBe(true);
    expect(result.errors.some(x => reasonOf(x.context) === 'parent_child_invalid')).toBe(false);
  });

  it('structural array gate carries field message (not just context)', async () => {
    const result = await deserialize(ArrayMsgDto, { items: 'not-an-array' });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'isArray');
    expect(e).toBeDefined();
    expect(e!.message).toBe('items must be an array');
  });

  it('Set-typed field structural gate (non-collection input) carries field context', async () => {
    const result = await deserialize(SetCtxDto, { items: 42 });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'isArray');
    expect(e).toBeDefined();
    expect(e!.path).toBe('items');
    expect(e!.context).toEqual({ reason: 'must_be_set' });
  });

  it('structural array gate carries field context in stopAtFirstError mode too', async () => {
    unseal();
    configure({ stopAtFirstError: true });
    seal();
    @Recipe
    class StopArrayCtxDto {
      @Field(arrayOf(isString), { context: { reason: 'must_be_array' } })
      items!: string[];
    }
    sealClass(StopArrayCtxDto);
    const result = await deserialize(StopArrayCtxDto, { items: 'x' });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'isArray');
    expect(e).toBeDefined();
    expect(e!.context).toEqual({ reason: 'must_be_array' });
  });

  it('field MESSAGE FUNCTION is invoked on a gate (non-rule) failure', async () => {
    const result = await deserialize(GateMsgFnDto, { maxAge: NaN });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'isInt');
    expect(e).toBeDefined();
    expect(e!.message).toBe('maxAge must be an integer');
  });

  it('Set each-element failure carries field context (element path)', async () => {
    const result = await deserialize(SetElemCtxDto, { tags: ['ok', 42] });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'isString');
    expect(e).toBeDefined();
    expect(e!.path).toMatch(/tags\[\d+\]/);
    expect(e!.context).toEqual({ reason: 'set_elem_invalid' });
  });

  it('invalidDiscriminator keeps its OWN context — field context must NOT leak in', async () => {
    const result = await deserialize(DiscCtxDto, { pet: { type: 'fish' } });
    assertBakerIssueSet(result);
    const e = result.errors.find(x => x.code === 'invalidDiscriminator');
    expect(e).toBeDefined();
    expect(reasonOf(e!.context)).not.toBe('pet_invalid');
    expect(result.errors.some(x => reasonOf(x.context) === 'pet_invalid')).toBe(false);
  });
});
