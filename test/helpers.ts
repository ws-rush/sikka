import { Engine } from '../src/index.js';

export function render(template: string, props?: Record<string, unknown>): string {
  return new Engine().renderString(template, props);
}

export function renderWith(
  options: ConstructorParameters<typeof Engine>[0],
  template: string,
  props?: Record<string, unknown>
): string {
  return new Engine(options).renderString(template, props);
}

export async function renderStream(
  template: string,
  props?: Record<string, unknown>
): Promise<string> {
  const gen = new Engine().streamString(template, props);
  const chunks: string[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks.join('');
}

export async function renderStreamChunks(
  template: string,
  props?: Record<string, unknown>
): Promise<string[]> {
  const gen = new Engine().streamString(template, props);
  const chunks: string[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

export async function consume(gen: AsyncGenerator<string>): Promise<void> {
  for await (const _ of gen) {
    void _;
  }
}

export async function collectStream(
  engine: Engine,
  template: string,
  props?: Record<string, unknown>
): Promise<string> {
  const gen = engine.streamString(template, props);
  const chunks: string[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks.join('');
}

export async function collectHtml(gen: AsyncGenerator<string>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks.join('');
}
