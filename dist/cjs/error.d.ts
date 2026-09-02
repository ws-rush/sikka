import type { SikkaDiagnostic, SikkaDiagnosticCategory } from './types.js';
/** A stable, machine-readable Sikka failure. Message wording is not stable API. */
export declare class SikkaError extends Error implements SikkaDiagnostic {
    readonly category: SikkaDiagnosticCategory;
    readonly template?: string;
    readonly request?: string;
    readonly importer?: string;
    readonly construct?: string;
    constructor(message: string, diagnostic: Omit<SikkaDiagnostic, 'message'>);
}
