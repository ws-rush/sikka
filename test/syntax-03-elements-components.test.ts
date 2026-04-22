import { describe, it, expect } from 'vitest';
import { Sikka } from '../src/index.js';
import { render } from './helpers.js';

describe('Syntax: Elements, Components, Fragments & Spreading', () => {
  describe('Fragments', () => {
    it('renders fragment shorthand without wrapper tag', () => {
      const html = render('<><span>a</span><span>b</span></>');
      expect(html).toBe('<span>a</span><span>b</span>');
    });

    it('renders explicit Fragment without wrapper tag', () => {
      const html = render('<Fragment><span>a</span></Fragment>');
      expect(html).toBe('<span>a</span>');
    });

    it('renders Fragment with set:html', () => {
      const html = render('<Fragment set:html="<b>3</b>" />');
      expect(html).toBe('<b>3</b>');
    });

    it('renders Fragment with set:text (escaped)', () => {
      const html = render('<Fragment set:text="<b>bold</b>" />');
      expect(html).toBe('&lt;b&gt;bold&lt;/b&gt;');
    });

    it('renders Fragment with slot attribute', () => {
      const sikka = new Sikka();
      sikka.loadComponent('Comp', '<div><slot name="x" /></div>');
      const html = sikka.renderString('<Comp><Fragment slot="x">content</Fragment></Comp>');
      expect(html).toBe('<div>content</div>');
    });

    it('renders nested fragments flattened', () => {
      const html = render('<><>a</><>b</></>');
      expect(html).toBe('ab');
    });

    it('renders Fragment with expression child', () => {
      const html = render('---\nconst val = "hi";\n---\n<>{val}</>');
      expect(html).toBe('hi');
    });

    it('renders Fragment around SVG tags', () => {
      const html = render('<svg><><path/></></svg>');
      // path is not in the void elements set, so it gets open/close tags
      expect(html).toBe('<svg><path></path></svg>');
    });

    it('renders Fragment around table rows', () => {
      const html = render('<table><tbody><><tr></tr></></tbody></table>');
      expect(html).toBe('<table><tbody><tr></tr></tbody></table>');
    });

    it('renders mixed native tags and components in fragment', () => {
      const sikka = new Sikka();
      sikka.loadComponent('Header', '<header>h</header>');
      const html = sikka.renderString('<><div/><Header/></>');
      expect(html).toBe('<div></div><header>h</header>');
    });

    it('renders Fragment inside <head>', () => {
      const html = render('<head><><title>7</title></></head>');
      expect(html).toBe('<head><title>7</title></head>');
    });

    it('renders Fragment inside <script> as raw text (not parsed as JSX)', () => {
      const html = render('<script>/* <></> */</script>');
      expect(html).toBe('<script>/* <></> */</script>');
    });

    it('throws CompileError for attributes on <>', () => {
      expect(() => render('<Fragment id="1">content</Fragment>')).toThrow();
    });

    it('throws CompileError for directives on <>', () => {
      expect(() => render('<Fragment is:raw></Fragment>')).toThrow();
    });
  });

  describe('Props Spreading', () => {
    it('overrides spread when static attr comes after', () => {
      const html = render(
        '---\nconst myProps = { id: "x", class: "a" };\n---\n<div {...myProps} id="y">hi</div>'
      );
      // static id after spread overrides
      expect(html).toContain('id="y"');
    });

    it('gets overridden when spread comes after static attr', () => {
      const html = render(
        '---\nconst myProps = { id: "x" };\n---\n<div id="static" {...myProps}>hi</div>'
      );
      // spread after static overrides
      expect(html).toContain('id="x"');
    });

    it('ignores spreading null', () => {
      const html = render('<div {...null}>hi</div>');
      expect(html).toBe('<div>hi</div>');
    });

    it('ignores spreading booleans', () => {
      const html = render('<div {...true}>hi</div>');
      expect(html).toBe('<div>hi</div>');
    });

    it('renders conditional spreading', () => {
      const html = render(
        '---\nconst x = true;\nconst myProps = { id: "yes" };\n---\n<div {...(x ? myProps : {})}>hi</div>'
      );
      expect(html).toContain('id="yes"');
    });

    it('spreads props on components', () => {
      const sikka = new Sikka();
      sikka.loadComponent('Btn', '<button class={Astro.props.cls}>{Astro.props.label}</button>');
      const html = sikka.renderString(
        '---\nconst p = { cls: "primary", label: "Click" };\n---\n<Btn {...p} />'
      );
      expect(html).toBe('<button class="primary">Click</button>');
    });

    it('spreads rest props from Astro.props', () => {
      const html = render(
        '---\nconst { a, ...rest } = Astro.props;\n---\n<div {...rest}>hi</div>',
        { a: '1', id: 'x', class: 'c' }
      );
      expect(html).toContain('id="x"');
      expect(html).toContain('class="c"');
    });

    it('spreads objects with class:list key', () => {
      const html = render(
        '---\nconst myProps = { "class:list": ["a", "b"] };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('class="a b"');
    });

    it('spreads objects with style key', () => {
      const html = render(
        '---\nconst myProps = { style: { color: "red" } };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('style="color:red"');
    });

    it('spreads objects with className key', () => {
      const html = render(
        '---\nconst myProps = { className: "test" };\n---\n<div {...myProps}>hi</div>'
      );
      expect(html).toContain('class="test"');
    });

    it('spreads objects with getters', () => {
      const html = render('<div {...{ get a() { return 1; } }}>hi</div>');
      expect(html).toBe('<div a="1">hi</div>');
    });
  });

  describe('Elements — Edge Cases', () => {
    it('renders void elements as self-closing', () => {
      expect(render('<br>')).toBe('<br />');
      expect(render('<hr>')).toBe('<hr />');
      expect(render('<img src="test.png">')).toBe('<img src="test.png" />');
      expect(render('<input type="text">')).toBe('<input type="text" />');
    });

    it('renders self-closing void elements', () => {
      expect(render('<br />')).toBe('<br />');
      expect(render('<img src="a.png" />')).toBe('<img src="a.png" />');
    });

    it('renders self-closing non-void elements with open/close tags', () => {
      expect(render('<div />')).toBe('<div></div>');
      expect(render('<span />')).toBe('<span></span>');
    });

    it('renders boolean attribute without value', () => {
      const html = render('<input disabled>');
      expect(html).toBe('<input disabled />');
    });

    it('renders dynamic boolean attribute true', () => {
      const html = render('<input disabled={true}>');
      expect(html).toContain('disabled');
    });

    it('renders dynamic boolean attribute false as empty string', () => {
      const html = render('<input disabled={false}>');
      expect(html).toContain('disabled');
    });

    it('renders numeric attribute value as string', () => {
      const html = render('<div data-count={42}>hi</div>');
      expect(html).toBe('<div data-count="42">hi</div>');
    });

    it('renders null attribute value as empty string', () => {
      const html = render('<div data-x={null}>hi</div>');
      expect(html).toBe('<div data-x="">hi</div>');
    });

    it('preserves empty string attribute', () => {
      const html = render('<div class="">hi</div>');
      expect(html).toBe('<div class="">hi</div>');
    });

    it('renders multiple attributes on one element', () => {
      const html = render('<div a="1" b="2" c="3">hi</div>');
      expect(html).toBe('<div a="1" b="2" c="3">hi</div>');
    });

    it('preserves multiline attribute values', () => {
      const html = render('<div class="\n  text-red\n">hi</div>');
      expect(html).toContain('text-red');
    });

    it('double-escapes HTML entities in static attributes', () => {
      // Current behavior: static attribute values are escaped
      const html = render('<div data-x="a&amp;b">c</div>');
      expect(html).toContain('&amp;');
    });

    it('renders deeply nested HTML (4+ levels)', () => {
      const html = render('<div><p><span><b>deep</b></span></p></div>');
      expect(html).toBe('<div><p><span><b>deep</b></span></p></div>');
    });

    it('preserves whitespace/tabs/newlines in template', () => {
      const html = render('<div>\n\t<span>a</span>\n</div>');
      expect(html).toBe('<div>\n\t<span>a</span>\n</div>');
    });

    it('preserves HTML comments in output', () => {
      const html = render('<!-- hello --><div>hi</div>');
      expect(html).toBe('<!-- hello --><div>hi</div>');
    });

    it('renders DOCTYPE', () => {
      const html = render('<!DOCTYPE html>');
      expect(html).toContain('DOCTYPE');
    });

    it('preserves SVG case-sensitive attributes', () => {
      const html = render('<svg viewBox="0 0 10 10"></svg>');
      expect(html).toContain('viewBox');
    });

    it('renders non-standard attributes', () => {
      const html = render('<div mycustomattr="1">hi</div>');
      expect(html).toContain('mycustomattr="1"');
    });
  });

  describe('Components — Edge Cases', () => {
    it('renders deeply nested components (3 levels)', () => {
      const sikka = new Sikka();
      sikka.loadComponent('A', '<a>{Astro.props.x}</a>');
      sikka.loadComponent('B', '<b><A x={Astro.props.y} /></b>');
      sikka.loadComponent('C', '<c><B y={Astro.props.z} /></c>');
      const html = sikka.renderString('<C z="deep" />');
      expect(html).toBe('<c><b><a>deep</a></b></c>');
    });

    it('discards children when component has no slot', () => {
      const sikka = new Sikka();
      sikka.loadComponent('NoSlot', '<div>no slot here</div>');
      const html = sikka.renderString('<NoSlot>discarded</NoSlot>');
      expect(html).toBe('<div>no slot here</div>');
    });

    it('receives both props and slots simultaneously', () => {
      const sikka = new Sikka();
      sikka.loadComponent(
        'Layout',
        '<html><head><slot name="head" /></head><body><slot /></body></html>'
      );
      const html = sikka.renderString(
        '<Layout><title>My Page</title><div slot="head"><meta /></div><p>Content</p></Layout>'
      );
      expect(html).toContain('<title>My Page</title>');
      expect(html).toContain('<meta />');
      expect(html).toContain('<p>Content</p>');
    });

    it('receives complex nested object props', () => {
      const html = render('---\nconst { user } = Astro.props;\n---\n<div>{user.name}</div>', {
        user: { name: 'Alice' },
      });
      expect(html).toBe('<div>Alice</div>');
    });

    it('receives array props', () => {
      const html = render('---\nconst { items } = Astro.props;\n---\n<div>{items.length}</div>', {
        items: [1, 2, 3],
      });
      expect(html).toBe('<div>3</div>');
    });

    it('renders self-closing component', () => {
      const sikka = new Sikka();
      sikka.loadComponent('Header', '<header />');
      const html = sikka.renderString('<Header/>');
      // 'header' is not a void element, so it renders with open/close tags
      expect(html).toBe('<header></header>');
    });

    it('renders fallback slot with expression', () => {
      const sikka = new Sikka();
      sikka.loadComponent('Fb', '<div><slot>{Astro.props.defaultText}</slot></div>');
      const html = sikka.renderString('<Fb defaultText="hello" />');
      expect(html).toBe('<div>hello</div>');
    });
  });

  describe('Attribute Edge Cases', () => {
    it('parses single-quoted attribute values', () => {
      const html = render("<div class='test'>hi</div>");
      expect(html).toContain('test');
    });

    it('parses attribute value with equals sign', () => {
      const html = render('<div data-x="a=b">hi</div>');
      expect(html).toContain('a=b');
    });

    it('parses multiple void elements', () => {
      const html = render('<br><hr><img src="x.png">');
      expect(html).toContain('<br />');
      expect(html).toContain('<hr />');
      expect(html).toContain('<img src="x.png" />');
    });

    it('parses DOCTYPE', () => {
      const html = render('<!DOCTYPE html>');
      expect(html).toContain('DOCTYPE');
    });

    it('preserves HTML comments in output', () => {
      const html = render('<!-- comment --><div>hi</div>');
      expect(html).toContain('<!-- comment -->');
      expect(html).toContain('hi');
    });

    it('renders unquoted attribute value', () => {
      const html = render('<div data-x=hello>hi</div>');
      expect(html).toContain('hello');
    });

    it('renders element with both static and dynamic attrs', () => {
      const html = render(
        '---\nconst myAttrs = { id: "x" };\n---\n<div class="a" id="b" {...myAttrs} style="c" style={{ color: "red" }}>hi</div>'
      );
      expect(html).toContain('class="a"');
      expect(html).toContain('style=');
      expect(html).toContain('hi');
    });

    it('handles mismatched closing tags', () => {
      const html = render('<div><span></div>');
      expect(html).toContain('<div>');
      expect(html).toContain('<span>');
    });

    it('handles closing tag with extra whitespace', () => {
      const html = render('<div>content</div >');
      expect(html).toBe('<div>content</div>');
    });

    it('handles opening tag with extra whitespace', () => {
      const html = render('<div >hi</div>');
      expect(html).toBe('<div>hi</div>');
    });
  });

  describe('Component Edge Cases', () => {
    it('renders component with text child as slot content', () => {
      const e = new Sikka();
      e.loadComponent('Comp', '<div><slot /></div>');
      const html = e.renderString('<Comp>text content</Comp>');
      expect(html).toBe('<div>text content</div>');
    });

    it('renders component with expression child as slot content', () => {
      const e = new Sikka();
      e.loadComponent('Comp', '<div><slot /></div>');
      const html = e.renderString('---\nconst val = "hi";\n---\n<Comp>{val}</Comp>');
      expect(html).toBe('<div>hi</div>');
    });

    it('renders component with boolean prop', () => {
      const e = new Sikka();
      e.loadComponent('BoolComp', '<div>{Astro.props.active ? "yes" : "no"}</div>');
      const html = e.renderString('<BoolComp active />');
      expect(html).toBe('<div>yes</div>');
    });

    it('renders component receiving class:list prop', () => {
      const e = new Sikka();
      e.loadComponent('Styled', '<div class:list={Astro.props.items} />');
      const html = e.renderString('<Styled items={["a", "b"]} />');
      expect(html).toBe('<div class="a b"></div>');
    });

    it('renders component receiving style prop', () => {
      const e = new Sikka();
      e.loadComponent('Styled', '<div style={Astro.props.s} />');
      const html = e.renderString('<Styled s={{ color: "red" }} />');
      expect(html).toBe('<div style="color:red"></div>');
    });

    it('renders nested component calls', () => {
      const e = new Sikka();
      e.loadComponent('A', '<a>{Astro.props.x}</a>');
      e.loadComponent('B', '<b><A x={Astro.props.y} /></b>');
      const html = e.renderString('<B y="val" />');
      expect(html).toBe('<b><a>val</a></b>');
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

    it('renders component in ternary true branch', () => {
      const e = new Sikka();
      e.loadComponent('A', '<span>A</span>');
      e.loadComponent('B', '<span>B</span>');
      const html = e.renderString('---\nconst x = true;\n---\n<div>{x ? <A/> : <B/>}</div>');
      expect(html).toBe('<div><span>A</span></div>');
    });

    it('renders component in ternary false branch', () => {
      const e = new Sikka();
      e.loadComponent('A', '<span>A</span>');
      e.loadComponent('B', '<span>B</span>');
      const html = e.renderString('---\nconst x = false;\n---\n<div>{x ? <A/> : <B/>}</div>');
      expect(html).toBe('<div><span>B</span></div>');
    });
  });

  describe('Spread Attribute Edge Cases', () => {
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
});
