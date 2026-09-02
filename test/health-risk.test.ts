import { describe, it } from 'node:test';
import { expect } from './assert.js';
import { createCache } from '../src/cache.js';
import { compile } from '../src/compiler.js';
import { parse } from '../src/parser.js';
import { runtime } from '../src/runtime.js';
import type { RenderFunction } from '../src/types.js';

function compileTemplate(source: string): RenderFunction {
  const parsed = parse(source);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const result = compile(parsed.ast);
  if (!result.ok) throw new Error(result.error.message);
  return result.fn;
}

describe('Health-risk paths', () => {
  it('covers LRU eviction and clearing', () => {
    const cache = createCache(1);
    const first = compileTemplate('<p>first</p>');
    const second = compileTemplate('<p>second</p>');

    cache.set('first', first);
    cache.set('second', second);
    expect(cache.get('first')).toBe(undefined);
    expect(cache.get('second')).toBe(second);
    cache.clear();
    expect(cache.get('second')).toBe(undefined);
  });

  it('covers compiled render entry points and directives', async () => {
    const html = compileTemplate('<div set:html={Astro.props.value} />');
    const text = compileTemplate('<div set:text={Astro.props.value} />');

    expect(html.renderSync({ value: '<b>Ada</b>' })).toBe('<div><b>Ada</b></div>');
    expect(await text({ value: '<Ada>' })).toBe('<div>&lt;Ada&gt;</div>');
    expect(await text.render({ value: '<Ada>' })).toBe('<div>&lt;Ada&gt;</div>');
  });

  it('parses unquoted attribute values', () => {
    const parsed = parse('<input aria-label=search disabled />');
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.ast.body[0]).toEqual({
      type: 'element',
      tag: 'input',
      attrs: [
        { name: 'aria-label', value: 'search' },
        { name: 'disabled', value: true },
      ],
      children: [],
      selfClosing: true,
    });
  });

  it('covers runtime style and filter helpers', () => {
    const helpers = runtime({
      autoFilter: true,
      filterFunction: (value) => `filtered:${value}`,
    });

    expect(helpers.classList(['base', { active: true, hidden: false }])).toBe('base active');
    expect(helpers.styleObject({ backgroundColor: 'navy' })).toBe('background-color:navy');
    expect(helpers.filter('Ada')).toBe('filtered:Ada');
  });
});
