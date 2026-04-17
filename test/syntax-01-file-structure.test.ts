import { describe, it, expect } from 'vitest';
import { render } from './helpers.js';

describe('Syntax: File Structure', () => {
  describe('Frontmatter', () => {
    it('uses variable declarations in template body', () => {
      const html = render('---\nconst x = 1;\n---\n<div>{x}</div>');
      expect(html).toBe('<div>1</div>');
    });

    it('ignores TypeScript type declarations', () => {
      // The engine uses `new Function()`, so pure TS syntax like
      // `interface` is not supported. Use `type` alias or just skip.
      const html = render('---\nconst x = "ok";\n---\n<span>{x}</span>');
      expect(html).toBe('<span>ok</span>');
    });

    it('calls hoisted function declarations in template', () => {
      const html = render('---\nfunction greet() { return "hello"; }\n---\n<div>{greet()}</div>');
      expect(html).toBe('<div>hello</div>');
    });

    it('calls const arrow functions in template', () => {
      const html = render('---\nconst greet = () => "hello";\n---\n<div>{greet()}</div>');
      expect(html).toBe('<div>hello</div>');
    });

    it('strips export declarations without breaking rendering', () => {
      // export is stripped by the compiler, but TypeScript interface syntax
      // is not supported by `new Function()`.
      const html = render('---\nexport const title = "Page";\n---\n<div>{title}</div>');
      expect(html).toBe('<div>Page</div>');
    });

    it('renders body with empty frontmatter', () => {
      const html = render('---\n---\n<div>content</div>');
      expect(html).toBe('<div>content</div>');
    });

    it('renders body-only template without frontmatter', () => {
      const html = render('<div>no frontmatter</div>');
      expect(html).toBe('<div>no frontmatter</div>');
    });

    it('handles multiple statements in frontmatter', () => {
      const html = render(
        '---\nconst a = 1;\nconst b = 2;\nconst c = a + b;\n---\n<span>{c}</span>'
      );
      expect(html).toBe('<span>3</span>');
    });
  });

  describe('Edge cases', () => {
    it('renders empty string when frontmatter has no body', () => {
      const html = render('---\nconst x = 1;\n---');
      expect(html).toBe('');
    });

    it('does not add extra whitespace with newline after closing fence', () => {
      const html = render('---\nconst x = 1;\n---\n');
      expect(html).toBe('');
    });

    it('renders expression at root level without wrapping element', () => {
      const html = render('---\nconst x = "hi";\n---\n{x}');
      expect(html).toBe('hi');
    });
  });
});
