export function orEmpty<T extends object>(obj: T | undefined): Partial<T> {
    return obj || {};
}
