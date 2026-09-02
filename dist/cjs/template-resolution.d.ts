import type { SourceResolver, SourceTemplate } from './types.js';
/** Resolves and validates a Template through the shared source resolver contract. */
export declare function resolveSourceTemplate(request: string, resolver: SourceResolver, importer?: string): SourceTemplate;
