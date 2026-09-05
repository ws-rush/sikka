import { Sikka } from '../src/index.js';

function source(template: string, options: { autoEscape?: boolean; debug?: boolean } = {}): Sikka {
  return new Sikka({
    ...options,
    mode: 'source',
    resolver: () => ({ id: 'test-entry.sikka', source: template }),
  });
}

export function render(template: string, props?: Record<string, unknown>): string {
  return source(template).render('test-entry.sikka', props);
}

export async function renderStream(
  template: string,
  props?: Record<string, unknown>
): Promise<string> {
  return collectHtml(source(template).stream('test-entry.sikka', props));
}

export async function consume(gen: AsyncGenerator<string>): Promise<void> {
  for await (const _ of gen) void _;
}

export async function collectHtml(gen: AsyncGenerator<string>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks.join('');
}
