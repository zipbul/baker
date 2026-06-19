/** Built-in constructors that are NOT treated as nested DTOs during seal. */
export const PRIMITIVE_CTORS = new Set<Function>([Number, String, Boolean, Date]);
