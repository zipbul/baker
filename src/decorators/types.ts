import type { EmittableRule } from '../rules';
import type { ArrayOfMarker } from './interfaces';

/** A positional @Field argument — either a rule or an arrayOf(...) element-rules marker. */
export type RuleArg = EmittableRule | ArrayOfMarker;

/** The container types an `arrayOf(...)` marker over element type E can validate. */
export type ContainerOf<E> = readonly E[] | Set<E> | Map<unknown, E>;

/**
 * Union of the element types of the `arrayOf(...)` markers in a `@Field(...)` argument tuple — `never`
 * when there is no marker. Derived from the args (not inferred from the field type), so a plain
 * non-container field keeps `E = never` and is not forced into a container domain.
 */
export type ArgElements<A extends readonly unknown[]> = {
  [K in keyof A]: A[K] extends ArrayOfMarker<infer E> ? E : never;
}[number];

/**
 * The field value type a `@Field(...)` call constrains. `V` is the domain shared by the top-level
 * rules (mixed domains are already rejected at the argument by the homogeneous `EmittableRule<V>`
 * inference); when an `arrayOf(...)` marker is present, the field must also be a container of the
 * element type E — hence `V & ContainerOf<E>`. `V = never` means every rule is universal (e.g.
 * `isEmpty`, typed `EmittableRule<never>` so it composes with any sibling), so the field is unconstrained.
 */
export type FieldValue<V, E> = [V] extends [never]
  ? [E] extends [never]
    ? unknown
    : ContainerOf<E>
  : [E] extends [never]
    ? V
    : V & ContainerOf<E>;

/**
 * The class-field decorator @Field returns. Constrains the decorated field's declared type to
 * `V | null | undefined` (the `| null | undefined` lets optional/nullable fields compile — presence
 * is enforced at runtime, not by the type). `V = unknown` applies to any field.
 */
export type FieldDecorator<V = unknown> = (
  value: undefined,
  context: ClassFieldDecoratorContext<unknown, V | null | undefined>,
) => void;
