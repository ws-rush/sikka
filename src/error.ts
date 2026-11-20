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
    const { message: _ignored, ...rest } = diagnostic as SikkaDiagnostic;
    Object.assign(this, rest);
  }
}

/** Classifies a parser/compiler diagnostic message by rejected construct, if any. */
export function rejectedConstruct(message: string): string | undefined {
  if (message.startsWith('InvalidDirective:')) return 'directive';
  if (message.startsWith('InvalidFragment:')) return 'Fragment';
  return undefined;
}
