import { SikkaError } from './error.js';
import type { SourceResolver, SourceTemplate } from './types.js';

/** Resolves and validates a Template through the shared source resolver contract. */
export function resolveSourceTemplate(
  request: string,
  resolver: SourceResolver,
  importer?: string
): SourceTemplate {
  const context = importer ? ` imported by canonical identity ${JSON.stringify(importer)}` : '';
  let template: unknown;
  try {
    template = resolver(request, importer);
  } catch (error) {
    throw new SikkaError(
      `ResolveError for ${JSON.stringify(request)}${context}: ${errorMessage(error)}`,
      { category: 'Resolve', request, importer, cause: error }
    );
  }
  if (isSourceTemplate(template)) return template;

  const identity = sourceIdentity(template);
  const suffix = identity ? ` (canonical identity ${JSON.stringify(identity)})` : '';
  throw new SikkaError(
    `ResolveError: invalid result for ${JSON.stringify(request)}${context}${suffix}`,
    { category: 'Resolve', request, importer, template: identity }
  );
}

function isSourceTemplate(value: unknown): value is SourceTemplate {
  const template = sourceTemplateRecord(value);
  return !!template && isTemplateIdentity(template.id) && typeof template.source === 'string';
}

function sourceTemplateRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function isTemplateIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceIdentity(value: unknown): string | undefined {
  const template = sourceTemplateRecord(value);
  return template && typeof template.id === 'string' ? template.id : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
