export function orEmpty<T>(obj: T | undefined): Partial<T> {
    return obj || {};
}
