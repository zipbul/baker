/** Generic class constructor — contravariant `never[]` args accept any user constructor */
export type ClassCtor<T = object> = new (...args: never[]) => T;
