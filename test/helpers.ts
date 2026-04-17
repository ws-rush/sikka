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
