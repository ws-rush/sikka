import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { expect } from './assert.js';

const require = createRequire(import.meta.url);
const editorsDir = path.resolve('editors');

function collectIncludes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectIncludes(item, out);
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.include === 'string') out.push(obj.include);
    for (const val of Object.values(obj)) collectIncludes(val, out);
  }
  return out;
}

describe('editor syntax support', () => {
  it('ships valid VS Code / TextMate grammar covering Sikka syntax', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(editorsDir, 'vscode/package.json'), 'utf8')
    ) as {
      contributes: {
        languages: { id: string; extensions: string[] }[];
        grammars: { language: string; scopeName: string; path: string }[];
      };
    };
    expect(pkg.contributes.languages[0].extensions).toEqual(['.sikka']);
    expect(pkg.contributes.grammars[0].scopeName).toBe('source.sikka');

    JSON.parse(
      fs.readFileSync(path.join(editorsDir, 'vscode/language-configuration.json'), 'utf8')
    );

    const grammar = JSON.parse(
      fs.readFileSync(path.join(editorsDir, 'vscode/syntaxes/sikka.tmLanguage.json'), 'utf8')
    ) as { scopeName: string; repository: Record<string, unknown> };
    expect(grammar.scopeName).toBe('source.sikka');

    const localIncludes = collectIncludes(grammar).filter((inc) => inc.startsWith('#'));
    for (const inc of localIncludes) {
      expect(Object.hasOwn(grammar.repository, inc.slice(1))).toBe(true);
    }

    const raw = JSON.stringify(grammar);
    for (const directive of ['set:', 'class:list', 'is:raw']) {
      expect(raw.includes(directive)).toBe(true);
    }
  });

  it('ships valid Tree-sitter, Vim, and Emacs syntax files', () => {
    const tsPkg = JSON.parse(
      fs.readFileSync(path.join(editorsDir, 'tree-sitter-sikka/package.json'), 'utf8')
    ) as { name: string };
    expect(tsPkg.name).toBe('tree-sitter-sikka');

    let capturedName = '';
    (globalThis as Record<string, unknown>).grammar = (def: { name: string }) => {
      capturedName = def.name;
      return def;
    };
    try {
      require(path.join(editorsDir, 'tree-sitter-sikka/grammar.js'));
      expect(capturedName).toBe('sikka');
    } finally {
      delete (globalThis as Record<string, unknown>).grammar;
    }

    const vimSyntax = fs.readFileSync(path.join(editorsDir, 'vim/syntax/sikka.vim'), 'utf8');
    expect(vimSyntax.includes('sikkaFrontmatter')).toBe(true);

    const elisp = fs.readFileSync(path.join(editorsDir, 'emacs/sikka-mode.el'), 'utf8');
    expect(elisp.includes('define-derived-mode sikka-mode')).toBe(true);
  });
});
