export function flatten<T>(...arrays: T[][]): T[] {
    return Array.of<T>().concat(...arrays);
}

declare global {
    interface Array<T> {
        choose<U>(f: (t: T) => U | undefined): U[];
    }
}

if (!Array.prototype.choose) {
    Array.prototype.choose = function<T, U>(this: T[], f: (t: T) => U | undefined) {
        return this.map(f).filter((o) => !!o).map((o) => o!);
    };
}
