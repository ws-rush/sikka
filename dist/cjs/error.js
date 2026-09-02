/** A stable, machine-readable Sikka failure. Message wording is not stable API. */
export class SikkaError extends Error {
    constructor(message, diagnostic) {
        super(message, { cause: diagnostic.cause });
        this.name = `${diagnostic.category}Error`;
        Object.assign(this, diagnostic);
    }
}
//# sourceMappingURL=error.js.map