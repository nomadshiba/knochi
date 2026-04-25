export type PromiseOrValue<T> = Promise<T> | T;
// deno-lint-ignore no-explicit-any
export type _ = any;

export type OmitByValue<T, V> = {
    [K in keyof T as T[K] extends V ? never : K]: T[K];
};

export type PickByValue<T, V> = {
    [K in keyof T as T[K] extends V ? K : never]: T[K];
};

export type NeverFallback<TMaybeNever, TFallback> = [TMaybeNever] extends [never] ? TFallback : TMaybeNever;
