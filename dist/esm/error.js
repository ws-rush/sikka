/** A stable, machine-readable Sikka failure. Message wording is not stable API. */
export class SikkaError extends Error {
    constructor(message, diagnostic) {
        super(message, { cause: diagnostic.cause });
        this.name = `${diagnostic.category}Error`;
        const { message: _ignored, ...rest } = diagnostic;
        Object.assign(this, rest);
    }
}
/** Classifies a parser/compiler diagnostic message by rejected construct, if any. */
export function rejectedConstruct(message) {
    if (message.startsWith('InvalidDirective:'))
        return 'directive';
    if (message.startsWith('InvalidFragment:'))
        return 'Fragment';
    return undefined;
}
//# sourceMappingURL=error.js.map