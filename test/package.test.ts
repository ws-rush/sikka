import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageFiles = [
  'CHANGELOG.md',
  'LICENSE',
  'README.astro-syntax.md',
  'README.md',
  'dist/cjs/cache.js',
  'dist/cjs/compiler.js',
  'dist/cjs/error.d.ts',
  'dist/cjs/error.js',
  'dist/cjs/escape.d.ts',
  'dist/cjs/escape.js',
  'dist/cjs/index.d.ts',
  'dist/cjs/index.js',
  'dist/cjs/package.json',
  'dist/cjs/parser.js',
  'dist/cjs/precompile.d.ts',
  'dist/cjs/precompile.js',
  'dist/cjs/runtime.d.ts',
  'dist/cjs/runtime.js',
  'dist/cjs/template-resolution.d.ts',
  'dist/cjs/template-resolution.js',
  'dist/cjs/types.d.ts',
  'dist/esm/cache.js',
  'dist/esm/compiler.js',
  'dist/esm/error.d.ts',
  'dist/esm/error.js',
  'dist/esm/escape.d.ts',
  'dist/esm/escape.js',
  'dist/esm/index.d.ts',
  'dist/esm/index.js',
  'dist/esm/parser.js',
  'dist/esm/precompile.d.ts',
  'dist/esm/precompile.js',
  'dist/esm/runtime.d.ts',
  'dist/esm/runtime.js',
  'dist/esm/template-resolution.d.ts',
  'dist/esm/template-resolution.js',
  'dist/esm/types.d.ts',
  'package.json',
];

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('npm package', () => {
  it('installs the exact tarball in a clean JavaScript and TypeScript consumer', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sikka-package-'));
    try {
      run('npm', ['run', 'build'], root);
      const [{ filename }] = JSON.parse(
        run('npm', ['pack', '--json', '--pack-destination', directory], root)
      ) as { filename: string }[];
      const tarball = join(directory, filename);
      const inventory = run('tar', ['-tzf', tarball], directory)
        .trim()
        .split('\n')
        .map((path) => path.replace(/^package\//, ''))
        .toSorted();
      assert.deepEqual(inventory, packageFiles.toSorted());

      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devEngines?: unknown;
        engines?: unknown;
      };
      assert.equal(manifest.dependencies, undefined);
      assert.equal(manifest.devEngines, undefined);
      assert.equal(manifest.engines, undefined);

      writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n');
      run(
        'npm',
        ['install', '--ignore-scripts', '--no-package-lock', tarball, 'typescript@7.0.2'],
        directory
      );
      writeFileSync(
        join(directory, 'generated.mjs'),
        `import { runtime } from 'sikka/runtime';
export function render(props) { return '<p>' + runtime(this).escape(props.name) + '</p>'; }
export async function* stream(props) { yield render.call(this, props); }
`
      );
      writeFileSync(
        join(directory, 'consumer.mjs'),
        `import { Sikka } from 'sikka';
import { compile } from 'sikka/precompile';
import * as generated from './generated.mjs';
const source = new Sikka({ mode: 'source', resolver: () => ({ id: 'page', source: '<p>{Astro.props.name}</p>' }) });
const precompiled = new Sikka({ mode: 'precompiled', resolver: () => generated });
if (source.render('page', { name: '<Ada>' }) !== '<p>&lt;Ada&gt;</p>') throw new Error('source render failed');
if (precompiled.render('page', { name: '<Ada>' }) !== '<p>&lt;Ada&gt;</p>') throw new Error('precompiled render failed');
if (compile('page', { resolver: () => ({ id: 'page', source: '<p>page</p>' }) })[0].id !== 'page') throw new Error('precompile failed');
`
      );
      writeFileSync(
        join(directory, 'consumer.cjs'),
        `const { Sikka } = require('sikka');
const { compile } = require('sikka/precompile');
const { runtime } = require('sikka/runtime');
const sikka = new Sikka({ mode: 'source', resolver: () => ({ id: 'page', source: '<p>{Astro.props.name}</p>' }) });
if (sikka.render('page', { name: 'Ada' }) !== '<p>Ada</p>') throw new Error('CommonJS render failed');
if (compile('page', { resolver: () => ({ id: 'page', source: '<p>page</p>' }) })[0].id !== 'page') throw new Error('CommonJS precompile failed');
if (typeof runtime !== 'function') throw new Error('CommonJS runtime failed');
`
      );
      writeFileSync(
        join(directory, 'types.ts'),
        `import { Sikka, SikkaError, type Cache, type PrecompiledModeOptions, type PrecompiledModule, type PrecompiledResolver, type SikkaDiagnostic, type SikkaDiagnosticCategory, type SourceModeOptions, type SourceResolver, type SourceTemplate } from 'sikka';
import { PRECOMPILE_ABI_VERSION, compile, type PrecompileArtifact, type PrecompileComponentEdge, type PrecompileOptions } from 'sikka/precompile';
import { RUNTIME_ABI_VERSION, runtime, type RuntimeHelpers, type RuntimeReceiver } from 'sikka/runtime';
const template: SourceTemplate = { id: 'page', source: '<p>page</p>' };
const resolver: SourceResolver = () => template;
const cache: Cache = new Map();
const source: SourceModeOptions = { mode: 'source', resolver, cache };
const module: PrecompiledModule = { render: () => '', async *stream() {} };
const precompiledResolver: PrecompiledResolver = () => module;
const precompiled: PrecompiledModeOptions = { mode: 'precompiled', resolver: precompiledResolver };
const app = new Sikka(source);
const error = new SikkaError('error', { category: 'Render' });
const category: SikkaDiagnosticCategory = error.category;
const diagnostic: SikkaDiagnostic = error;
const edge: PrecompileComponentEdge = { localName: 'Card', specifier: './Card.astro', id: 'card' };
const options: PrecompileOptions = { resolver };
const artifact: PrecompileArtifact = compile('page', options)[0]!;
const receiver: RuntimeReceiver = {};
const helpers: RuntimeHelpers = runtime(receiver);
void [app, precompiled, category, diagnostic, edge, artifact, helpers, PRECOMPILE_ABI_VERSION, RUNTIME_ABI_VERSION];
`
      );
      writeFileSync(
        join(directory, 'types.cts'),
        `import sikka = require('sikka');
import precompile = require('sikka/precompile');
import generatedRuntime = require('sikka/runtime');
const app = new sikka.Sikka({ mode: 'source', resolver: () => ({ id: 'page', source: '' }) });
const artifacts = precompile.compile('page', { resolver: () => ({ id: 'page', source: '' }) });
const helpers = generatedRuntime.runtime({});
void [app, artifacts, helpers, generatedRuntime.RUNTIME_ABI_VERSION];
`
      );
      writeFileSync(
        join(directory, 'tsconfig.json'),
        '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","strict":true,"noEmit":true}}\n'
      );

      run(process.execPath, ['consumer.mjs'], directory);
      run(process.execPath, ['consumer.cjs'], directory);
      run(
        process.execPath,
        [join(directory, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
        directory
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
