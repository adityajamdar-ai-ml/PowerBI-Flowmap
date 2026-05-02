export namespace jsonp {
    export function get(_url: string, then: (data: any) => void): void {
        setTimeout(() => then(null), 0);
    }
}
