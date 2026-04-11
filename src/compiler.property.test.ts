/**
 * Property-based tests for the compiler
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { compileAST } from './compiler.js';
import { escapeHtml } from './escape.js';
import type { TemplateAST, RenderFunction } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal TemplateAST with the given frontmatter source and body nodes. */
function makeAST(frontmatterSource: string, bodyNodes: TemplateAST['body']): TemplateAST {
  return {
    frontmatter: { source: frontmatterSource },
    body: bodyNodes,
    imports: [],
  };
}

/** Compile an AST and assert success, returning the render function. */
function mustCompile(ast: TemplateAST, options?: Parameters<typeof compileAST>[1]): RenderFunction {
  const result = compileAST(ast, options);
  if (!result.ok) throw new Error(`Compile failed: ${result.error.message}`);
  return result.fn;
}

/** Invoke a render function and await the result (AsyncFunction returns a Promise). */
async function render(
  fn: RenderFunction,
  props: Record<string, unknown> = {},
  slots: Record<string, string> = {}
): Promise<string> {
  return await (fn(props, slots) as unknown as Promise<string>);
}

// ─── Property 9 ───────────────────────────────────────────────────────────────

describe('Property-Based Tests — Compiler Output', () => {
  it(// Feature: astro-template-engine, Property 9: Props and expressions correctly reflected in rendered output
  'Property 9: rendered output contains escaped prop value, conditional fragment, and loop items', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Props record with a string "val", a boolean "show", and an array "items"
        fc.record({
          val: fc.string(),
          show: fc.boolean(),
          items: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 5 }),
        }),
        async (props) => {
          // ── Part A: prop interpolation ──────────────────────────────────
          // Template: reads props.val in frontmatter, interpolates it in body
          const interpAST = makeAST('const { val } = Astro.props;', [
            { type: 'expression', source: 'val' },
          ]);
          const interpFn = mustCompile(interpAST, { varName: 'Astro' });
          const interpOut = await render(interpFn, props);
          // The output must contain the escaped representation of props.val
          expect(interpOut).toContain(escapeHtml(props.val));

          // ── Part B: conditional rendering ──────────────────────────────
          // Template: {show && <span>yes</span>}
          const condAST = makeAST('const { show } = Astro.props;', [
            {
              type: 'expression',
              source: 'show && "<span>yes</span>"',
            },
          ]);
          const condFn = mustCompile(condAST, { varName: 'Astro' });
          const condOut = await render(condFn, props);
          if (props.show) {
            expect(condOut).toContain('&lt;span&gt;yes&lt;/span&gt;');
          } else {
            // falsy: && short-circuits to false → escapeHtml(false) = "" (in new implementation)
            // The important thing is the fragment text is NOT present
            expect(condOut).not.toContain('yes');
          }

          // ── Part C: loop rendering ──────────────────────────────────────
          // Template: {items.map(item => item).join('')}
          // We use a simple join expression so each item appears in output
          const loopAST = makeAST('const { items } = Astro.props;', [
            {
              type: 'expression',
              source: 'items.map(item => item).join(",")',
            },
          ]);
          const loopFn = mustCompile(loopAST, { varName: 'Astro' });
          const loopOut = await render(loopFn, props);
          for (const item of props.items) {
            expect(loopOut).toContain(escapeHtml(item));
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // ─── Property 10 ────────────────────────────────────────────────────────────

  it(// Feature: astro-template-engine, Property 10: Slot content appears in rendered output
  'Property 10: default and named slot content appears in rendered output', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // default slot content
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)), // slot name
        fc.string({ minLength: 1 }), // named slot content
        async (defaultContent, slotName, namedContent) => {
          // ── Default slot ────────────────────────────────────────────────
          const defaultSlotAST = makeAST('', [
            { type: 'text', value: 'before:' },
            { type: 'slot', name: '', children: [] },
            { type: 'text', value: ':after' },
          ]);
          const defaultFn = mustCompile(defaultSlotAST);
          const defaultOut = await render(defaultFn, {}, { '': defaultContent });
          expect(defaultOut).toContain(defaultContent);

          // ── Named slot ──────────────────────────────────────────────────
          const namedSlotAST = makeAST('', [
            { type: 'text', value: 'before:' },
            { type: 'slot', name: slotName, children: [] },
            { type: 'text', value: ':after' },
          ]);
          const namedFn = mustCompile(namedSlotAST);
          const namedOut = await render(namedFn, {}, { [slotName]: namedContent });
          expect(namedOut).toContain(namedContent);
        }
      ),
      { numRuns: 100 }
    );
  });

  // ─── Property 11 ────────────────────────────────────────────────────────────

  it(// Feature: astro-template-engine, Property 11: Child component receives forwarded attribute props
  'Property 11: child component receives forwarded attribute props from parent JSX syntax', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use safe string values for prop values (avoid characters that break JS identifiers)
        fc.record({
          foo: fc.string(),
          bar: fc.string(),
        }),
        async (attrValues) => {
          // Child component: reads props.foo and props.bar, renders them
          const childAST = makeAST('const { foo, bar } = Astro.props;', [
            { type: 'expression', source: 'foo' },
            { type: 'text', value: '|' },
            { type: 'expression', source: 'bar' },
          ]);
          const childResult = compileAST(childAST, { varName: 'Astro' });
          if (!childResult.ok)
            throw new Error(`Child compile failed: ${childResult.error.message}`);
          const childFn = childResult.fn;

          // Parent component: renders <Child foo={fooVal} bar={barVal} />
          // We build the parent AST directly with an ElementNode that references "Child"
          const parentAST = makeAST(`const { fooVal, barVal } = Astro.props;`, [
            {
              type: 'element',
              tag: 'Child',
              attrs: [
                { name: 'foo', value: { type: 'expression', source: 'fooVal' } },
                { name: 'bar', value: { type: 'expression', source: 'barVal' } },
              ],
              children: [],
              selfClosing: true,
            },
          ]);

          const parentFn = mustCompile(parentAST, {
            components: { Child: childFn },
            varName: 'Astro',
          });
          const parentOut = await render(parentFn, {
            fooVal: attrValues.foo,
            barVal: attrValues.bar,
          });

          // The parent output should contain the child's rendered output,
          // which reflects the forwarded prop values
          expect(parentOut).toContain(escapeHtml(attrValues.foo));
          expect(parentOut).toContain(escapeHtml(attrValues.bar));
        }
      ),
      { numRuns: 100 }
    );
  });
});
