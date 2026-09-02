import type { SikkaDiagnostic, SikkaDiagnosticCategory } from './types.js';

/** A stable, machine-readable Sikka failure. Message wording is not stable API. */
export class SikkaError extends Error implements SikkaDiagnostic {
  declare readonly category: SikkaDiagnosticCategory;
  declare readonly template?: string;
  declare readonly request?: string;
  declare readonly importer?: string;
  declare readonly construct?: string;

  constructor(message: string, diagnostic: Omit<SikkaDiagnostic, 'message'>) {
    super(message, { cause: diagnostic.cause });
    this.name = `${diagnostic.category}Error`;
    Object.assign(this, diagnostic);
  }
}
