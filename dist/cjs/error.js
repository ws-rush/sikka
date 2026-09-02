"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SikkaError = void 0;
/** A stable, machine-readable Sikka failure. Message wording is not stable API. */
class SikkaError extends Error {
    constructor(message, diagnostic) {
        super(message, { cause: diagnostic.cause });
        this.name = `${diagnostic.category}Error`;
        Object.assign(this, diagnostic);
    }
}
exports.SikkaError = SikkaError;
//# sourceMappingURL=error.js.map