import type { SikkaDiagnostic, SikkaDiagnosticCategory } from './types.js';

/** A stable, machine-readable Sikka failure. Message wording is not stable API. */
export class SikkaError extends Error implements SikkaDiagnostic {
  readonly category: SikkaDiagnosticCategory;
  readonly template?: string;
  readonly request?: string;
  readonly importer?: string;
  readonly construct?: string;

  constructor(message: string, diagnostic: SikkaDiagnostic) {
    super(message, { cause: diagnostic.cause });
    this.name = 'SikkaError';
    Object.assign(this, diagnostic);
  }
}
