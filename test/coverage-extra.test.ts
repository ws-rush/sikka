import { describe, it, expect } from 'vitest';
import { Engine } from '../src/index.js';
import { render } from './helpers.js';

describe('Additional Coverage: Parser & Compiler Paths', () => {
  const engine = new Engine();

  describe('Parser: attribute edge cases', () => {
    it('parses single-quoted attribute values', () => {
      const html = render("<div class='test'>hi</div>");
      expect(html).toContain('test');
    });

    it('parses attribute value with equals sign', () => {
      const html = render('<div data-x="a=b">hi</div>');
      expect(html).toContain('a=b');
    });

    it('parses self-closing script', () => {
      const html = render('<script />');
      expect(html).toBe('<script></script>');
    });

    it('parses self-closing style', () => {
      const html = render('<style />');
      expect(html).toBe('<style></style>');
    });

    it('parses script with is:inline attribute', () => {
      const html = render('<script is:inline>var x;</script>');
      expect(html).toBe('<script is:inline>var x;</script>');
    });

    it('parses style with is:inline attribute', () => {
      const html = render('<style is:inline>body{}</style>');
      expect(html).toBe('<style is:inline>body{}</style>');
    });

    it('parses DOCTYPE', () => {
      const html = render('<!DOCTYPE html>');
      expect(html).toContain('DOCTYPE');
    });

    it('parses HTML comment', () => {
      const html = render('<!-- comment --><div>hi</div>');
      expect(html).toContain('<!-- comment -->');
      expect(html).toContain('hi');
    });

    it('parses multiple void elements', () => {
      const html = render('<br><hr><img src="x.png">');
      expect(html).toContain('<br />');
      expect(html).toContain('<hr />');
      expect(html).toContain('<img src="x.png" />');
    });
  });

  describe('Parser: expression edge cases', () => {
    it('parses template literal with interpolation', () => {
      const html = render('---\nconst x = "world";\n---\n<div>{`hello ${x}`}</div>');
      expect(html).toBe('<div>hello world</div>');
    });

    it('parses nested expressions with elements', () => {
      const html = render(
        '---\nconst arr = [1, 2];\n---\n<div>{arr.map(i => <span>{i}</span>)}</div>'
      );
      expect(html).toBe('<div><span>1</span><span>2</span></div>');
    });

    it('parses expression with string literal containing braces', () => {
      const html = render('<div>{"{"}</div>');
      expect(html).toBe('<div>{</div>');
    });
  });

  describe('Compiler: component edge cases', () => {
    it('renders component used as fallback in slot', () => {
      const e = new Engine();
      e.loadComponent('Fallback', '<span>fb</span>');
      e.loadComponent('Comp', '<div><slot><Fallback /></slot></div>');
      const html = e.renderString('<Comp />');
      expect(html).toBe('<div><span>fb</span></div>');
    });

    it('renders component receiving class:list prop', () => {
      const e = new Engine();
      e.loadComponent('Styled', '<div class:list={Astro.props.items} />');
      const html = e.renderString('<Styled items={["a", "b"]} />');
      expect(html).toBe('<div class="a b"></div>');
    });

    it('renders component receiving style prop', () => {
      const e = new Engine();
      e.loadComponent('Styled', '<div style={Astro.props.s} />');
      const html = e.renderString('<Styled s={{ color: "red" }} />');
      expect(html).toBe('<div style="color:red"></div>');
    });

    it('renders nested component calls', () => {
      const e = new Engine();
      e.loadComponent('A', '<a>{Astro.props.x}</a>');
      e.loadComponent('B', '<b><A x={Astro.props.y} /></b>');
      const html = e.renderString('<B y="val" />');
      expect(html).toBe('<b><a>val</a></b>');
    });
  });

  describe('Compiler: spread attribute code paths', () => {
    it('spreads className through spread attribute', () => {
      const html = render(
        '---\nconst myProps = { className: "test" };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('class="test"');
    });

    it('spreads class through spread attribute', () => {
      const html = render(
        '---\nconst myProps = { class: "test" };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('class="test"');
    });

    it('spreads boolean attribute through spread', () => {
      const html = render('---\nconst myProps = { disabled: true };\n---\n<input {...myProps} />');
      expect(html).toContain('disabled');
    });

    it('spreads mixed attributes through spread', () => {
      const html = render(
        '---\nconst myProps = { id: "x", title: "t" };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('id="x"');
      expect(html).toContain('title="t"');
    });
  });

  describe('Compiler: is:raw code paths', () => {
    it('renders is:raw with nested opening tags', () => {
      const html = render('<div is:raw><span>text</span></div>');
      expect(html).toBe('<div><span>text</span></div>');
    });
  });

  describe('Compiler: error code paths', () => {
    it('throws CompileError for compile-time errors', () => {
      expect(() => engine.compileToString('---\n---\n{x}')).not.toThrow();
    });

    it('compileToString includes generated source', () => {
      const src = engine.compileToString('<div>test</div>');
      expect(src).toContain('__out');
      expect(src).toContain('return');
    });

    it('renders unclosed element at EOF', () => {
      expect(() => engine.renderString('<div>unclosed')).toThrow(/ParseError/);
    });

    it('handles mismatched closing tags', () => {
      const html = engine.renderString('<div><span></div>');
      expect(html).toContain('<div>');
      expect(html).toContain('<span>');
    });

    it('handles closing tag with extra whitespace', () => {
      const html = engine.renderString('<div>content</div >');
      expect(html).toBe('<div>content</div>');
    });

    it('handles opening tag with extra whitespace', () => {
      const html = engine.renderString('<div >hi</div>');
      expect(html).toBe('<div>hi</div>');
    });

    it('renders set:text with dynamic value (escaped)', () => {
      const html = engine.renderString(
        '---\nconst txt = "<b>bold</b>";\n---\n<div set:text={txt} />'
      );
      expect(html).toBe('<div>&lt;b&gt;bold&lt;/b&gt;</div>');
    });

    it('renders is:raw with nested same-type elements', () => {
      const html = engine.renderString('<div is:raw><div>inner</div></div>');
      expect(html).toBe('<div><div>inner</div></div>');
    });

    it('throws ParseError for unclosed style', () => {
      expect(() => engine.renderString('<style>body{}')).toThrow(/ParseError/);
    });

    it('throws ParseError for unclosed slot', () => {
      expect(() => engine.renderString('<slot name="x">')).toThrow(/ParseError/);
    });

    it('throws ParseError for unclosed string literal in expression', () => {
      expect(() => engine.renderString('<div>{"unclosed}</div>')).toThrow(/ParseError/);
    });

    it('throws ParseError for missing > after script attributes', () => {
      expect(() => engine.renderString('<script type="module"')).toThrow(/ParseError/);
    });

    it('throws ParseError for missing close after slot attributes', () => {
      expect(() => engine.renderString('<slot name="x"')).toThrow(/ParseError/);
    });

    it('throws ParseError for missing > on element opening tag', () => {
      expect(() => engine.renderString('<div class="x"')).toThrow(/ParseError/);
    });

    it('throws ParseError for missing attribute name', () => {
      expect(() => engine.renderString('<div ="val">')).toThrow(/ParseError/);
    });

    it('throws ParseError for script with / but no >', () => {
      expect(() => engine.renderString('<script type="module"/ var x;')).toThrow(/ParseError/);
    });

    it('renders unclosed attribute value string', () => {
      // Unclosed quote
      expect(() => engine.renderString('<div class="unclosed>hi</div>')).toThrow(/ParseError/);
    });

    it('renders unquoted attribute value', () => {
      const html = engine.renderString('<div data-x=hello>hi</div>');
      expect(html).toContain('hello');
    });

    it('renders element with both static and dynamic attrs', () => {
      const html = engine.renderString(
        '---\nconst myAttrs = { id: "x" };\n---\n<div class="a" id="b" {...myAttrs} style="c" style={{ color: "red" }}>hi</div>'
      );
      expect(html).toContain('class="a"');
      expect(html).toContain('style=');
      expect(html).toContain('hi');
    });
  });

  describe('Compiler: Astro global code paths', () => {
    it('creates Astro object only when used in template', () => {
      // Template without Astro reference
      const src1 = engine.compileToString('<div>static</div>');
      expect(src1).not.toContain('Astro');

      // Template with Astro reference
      const src2 = engine.compileToString('---\nconst { x } = Astro.props;\n---\n<div>{x}</div>');
      expect(src2).toContain('Astro');
    });

    it('resolves component imports from frontmatter', () => {
      const src = engine.compileToString('import Foo from "./foo.astro";\n<Foo />');
      expect(src).toContain('__components');
    });

    it('resolves file-based component imports through render', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro')
            return '---\nimport Comp from "./comp.astro";\n---\n<Comp x="1" />';
          if (p === '/v/comp.astro') return '<div>{Astro.props.x}</div>';
          return null as unknown as string;
        },
      });
      const html = e.render('/v/main.astro');
      expect(html).toBe('<div>1</div>');
    });

    it('resolves nested file-based component imports', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro') return '---\nimport A from "./a.astro";\n---\n<A />';
          if (p === '/v/a.astro') return '---\nimport B from "./b.astro";\n---\n<B />';
          if (p === '/v/b.astro') return '<span>deep</span>';
          return null as unknown as string;
        },
      });
      const html = e.render('/v/main.astro');
      expect(html).toBe('<span>deep</span>');
    });

    it('throws for circular file-based component imports', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/a.astro') return '---\nimport B from "./b.astro";\n---\n<B />';
          if (p === '/v/b.astro') return '---\nimport A from "./a.astro";\n---\n<A />';
          return null as unknown as string;
        },
      });
      expect(() => e.render('/v/a.astro')).toThrow(/CompileError/);
    });

    it('throws for missing component import file', () => {
      const e = new Engine({
        readFile: (p) => {
          if (p === '/v/main.astro')
            return '---\nimport Missing from "./missing.astro";\n---\n<Missing />';
          return null as unknown as string;
        },
      });
      expect(() => e.render('/v/main.astro')).toThrow(/CompileError/);
    });
  });

  describe('File-based rendering', () => {
    it('caches compiled file templates', () => {
      let readCount = 0;
      const e = new Engine({
        cache: true,
        views: '/v',
        readFile: (_p) => {
          readCount++;
          return '<div>cached</div>';
        },
      });
      e.render('test.astro');
      e.render('test.astro');
      expect(readCount).toBe(1);
    });

    it('re-reads file after cache invalidation', () => {
      let readCount = 0;
      const e = new Engine({
        cache: true,
        views: '/v',
        readFile: (_p) => {
          readCount++;
          return '<div>file</div>';
        },
      });
      e.render('test.astro');
      e.invalidate('/v/test.astro');
      e.render('test.astro');
      expect(readCount).toBe(2);
    });

    it('throws ParseError for malformed file content', () => {
      const e = new Engine({
        views: '/v',
        readFile: () => '---\nunclosed',
      });
      expect(() => e.render('bad.astro')).toThrow(/ParseError/);
    });

    it('throws CompileError for invalid file content', () => {
      const e = new Engine({
        views: '/v',
        readFile: () => '<div set:html="a" set:text="b" />',
      });
      expect(() => e.render('bad2.astro')).toThrow(/CompileError/);
    });
  });

  describe('Compiler: component slot code paths', () => {
    it('renders component with text child as slot content', () => {
      const e = new Engine();
      e.loadComponent('Comp', '<div><slot /></div>');
      const html = e.renderString('<Comp>text content</Comp>');
      expect(html).toBe('<div>text content</div>');
    });

    it('renders component with expression child as slot content', () => {
      const e = new Engine();
      e.loadComponent('Comp', '<div><slot /></div>');
      const html = e.renderString('---\nconst val = "hi";\n---\n<Comp>{val}</Comp>');
      expect(html).toBe('<div>hi</div>');
    });

    it('renders component with boolean prop', () => {
      const e = new Engine();
      e.loadComponent('BoolComp', '<div>{Astro.props.active ? "yes" : "no"}</div>');
      const html = e.renderString('<BoolComp active />');
      expect(html).toBe('<div>yes</div>');
    });

    it('renders component with dynamic slot attribute value', () => {
      const e = new Engine();
      e.loadComponent('Comp', '<div><slot name="x" /></div>');
      const html = e.renderString(
        '---\nconst slotName = "x";\n---\n<Comp><span slot={slotName}>dynamic</span></Comp>'
      );
      expect(html).toContain('dynamic');
    });

    it('renders component with boolean slot attribute', () => {
      const e = new Engine();
      e.loadComponent('Comp', '<div><slot /></div>');
      const html = e.renderString('<Comp><span slot>content</span></Comp>');
      // slot without value = default slot
      expect(html).toContain('content');
    });

    it('renders unknown capitalized tag as literal HTML (self-closing)', () => {
      const html = render('<Unknown x="1" />');
      expect(html).toContain('Unknown');
      expect(html).toContain('x="1"');
    });

    it('renders unknown capitalized tag with children', () => {
      const html = render('<UnknownTag x="1">hi</UnknownTag>');
      expect(html).toContain('UnknownTag');
      expect(html).toContain('hi');
    });
  });

  describe('Compiler: class:list edge cases', () => {
    it('handles inline array mutation with push', () => {
      const html = render(
        '---\nconst arr = ["a"];\n---\n<div class:list={arr.push("b") && arr} />'
      );
      expect(html).toContain('class="a b"');
    });
  });

  describe('Compiler: style edge cases', () => {
    it('uses custom toString when defined', () => {
      const html = render('<div style={{ toString: () => "color:red" }} />');
      expect(html).toContain('color:red');
    });
  });

  describe('Compiler: ternary with components', () => {
    it('renders component in ternary true branch', () => {
      const e = new Engine();
      e.loadComponent('A', '<span>A</span>');
      e.loadComponent('B', '<span>B</span>');
      const html = e.renderString('---\nconst x = true;\n---\n<div>{x ? <A/> : <B/>}</div>');
      expect(html).toBe('<div><span>A</span></div>');
    });

    it('renders component in ternary false branch', () => {
      const e = new Engine();
      e.loadComponent('A', '<span>A</span>');
      e.loadComponent('B', '<span>B</span>');
      const html = e.renderString('---\nconst x = false;\n---\n<div>{x ? <A/> : <B/>}</div>');
      expect(html).toBe('<div><span>B</span></div>');
    });
  });
});
