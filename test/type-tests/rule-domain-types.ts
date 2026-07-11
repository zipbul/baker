/**
 * Type-level tests for Rule<V> — the @Field rule↔field domain cross-check. Not a runtime spec:
 * it is validated by the `typecheck` gate (tsgo --noEmit over the project). Every `@ts-expect-error`
 * asserts a MISMATCH is rejected at compile time; every un-annotated line asserts a valid use compiles.
 * Runtime behaviour is unchanged — see the *.test.ts suites.
 */
import { Baker, Field, arrayOf } from '../../index';
import {
  isString,
  isBoolean,
  isDate,
  isArray,
  isNumber,
  min,
  minLength,
  isEmail,
  arrayMinSize,
  arrayContains,
  isLatitude,
  equals,
  isIn,
  isEmpty,
  oneOf,
} from '../../src/rules/index';

const baker = new Baker();

// ── 1. HAPPY — correct rule/field pairings compile ───────────────────────────
class Happy {
  @Field(isString) s!: string;
  @Field(min(5)) n!: number;
  @Field(isBoolean) b!: boolean;
  @Field(isDate) d!: Date;
  @Field(isEmail()) e!: string;
  @Field(isArray) a!: unknown[];
  @Field(isNumber(), min(0)) num!: number;
  @Field(isString, minLength(2), isEmail()) multi!: string;
}

// ── 2. NEGATIVE — domain mismatches must NOT compile ─────────────────────────
class Negative {
  // @ts-expect-error string rule on a number field
  @Field(isString) age!: number;
  // @ts-expect-error number rule on a string field
  @Field(min(5)) name!: string;
  // @ts-expect-error mixed rule domains (string + number)
  @Field(isString, min(0)) x!: string;
  // @ts-expect-error mixed rule domains, union field
  @Field(isString, min(0)) y!: string | number;
  // @ts-expect-error single-domain rule on a value-union field
  @Field(isString) v!: string | number;
  // @ts-expect-error arrayOf element rule mismatch (number rule on string elements)
  @Field(arrayOf(isString, min(5))) t!: string[];
  // @ts-expect-error arrayOf element type mismatch (string elements, number field)
  @Field(arrayOf(isString)) nums!: number[];
  // @ts-expect-error array rule + arrayOf on a wrong-element container
  @Field(isArray, arrayOf(isString)) badMix!: number[];
  // @ts-expect-error widened equality mismatch
  @Field(equals(5)) se!: string;
  // @ts-expect-error widened membership mismatch
  @Field(isIn([1, 2])) si!: string;
  // @ts-expect-error dual-domain rule (string|number) still rejects a boolean field
  @Field(isLatitude) latBool!: boolean;
  // @ts-expect-error oneOf domain is the union of its branches — number is not among {string, boolean}
  @Field(oneOf(isString, isBoolean)) notInUnion!: number;
  // @ts-expect-error array/collection rule on a non-collection field
  @Field(arrayMinSize(1)) notCollection!: string;
}

// ── 3. EDGE — valid boundary cases compile ───────────────────────────────────
class Edge {
  @Field(isString) opt?: string;
  @Field(isString) nul!: string | null;
  @Field(isString) und!: string | undefined;
  @Field(isString) both!: string | null | undefined;
  @Field(isString) lit!: 'a' | 'b';
  @Field(min(1)) port!: 8080 | 3000;
  @Field(isLatitude) latStr!: string;
  @Field(isLatitude) latNum!: number;
  @Field(equals('a')) eqLit!: 'a' | 'b';
  @Field(isIn(['a', 'b'] as const)) inStr!: string;
  @Field(oneOf(isString, isBoolean)) either!: string | boolean;
  @Field(arrayOf(isString)) arr!: string[];
  @Field(arrayOf(isString)) ro!: readonly string[];
  @Field(arrayOf(isString)) set!: Set<string>;
  @Field(arrayOf(isString)) map!: Map<string, string>;
  @Field(arrayMinSize(2)) sized!: Set<string>;
  @Field(arrayContains(['x'])) contains!: string[];
  @Field(isArray, arrayMinSize(1), arrayOf(isString, minLength(2))) mixed!: string[];
  @Field(arrayOf(isString), { optional: true }) withOpts?: string[];
  @Field(isEmpty) anyField!: number; // universal rule applies to any field
  @Field() marker!: string;
  @Field({ type: () => Object }) optionsOnly!: unknown;
}

// ── 4. EXCEPTION — the type layer never changes runtime; guards still hold ────
class Exception {
  // A deliberate type escape (the untyped path) still compiles and the runtime validates as string.
  @Field({ rules: [isString] }) viaOptions!: number;
}

// The type layer is compile-time only: runtime still rejects invalid input for a wrongly-typed field.
export function exerciseRuntimeUnchanged(): void {
  baker.seal();
  void Happy;
  void Negative;
  void Edge;
  void Exception;
}
