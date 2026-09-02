#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const CORPUS_URL = pathToFileURL(join(ROOT, 'test/corpus.mjs')).href;
const PORTABLE_URL = pathToFileURL(join(ROOT, 'test/portable.ts')).href;
const PROPERTY_IDS = [
  'portable-deterministic-render',
  'portable-null-default-props',
  'portable-frontmatter-equivalence',
  'portable-escaping-list',
  'portable-component-isolation',
];

const cliArguments = process.argv.slice(2);
if (cliArguments[0] === '--') cliArguments.shift();
if (cliArguments[0] === '--generate') await generateTemplates(cliArguments[1], cliArguments[2]);
else if (cliArguments[0] === '--validate') await validateCandidate(cliArguments[1]);
else await createCandidateArtifacts(cliArguments);

async function createCandidateArtifacts(arguments_) {
  const { syntaxContractCases, validateSyntaxContractCases } = await import(
    pathToFileURL(join(ROOT, 'test/syntax-contract.ts')).href
  );
  const [tarball, browserDirectory, reportPath] = arguments_;
  if (!tarball || !browserDirectory || !reportPath)
    throw new Error(
      'Usage: ci:candidate <tarball> <browser-artifacts-directory> <node-report.json>'
    );

  validateSyntaxContractCases(syntaxContractCases);
  const output = resolve(browserDirectory);
  const candidate = resolve(tarball);
  const consumer = await installCandidate(candidate);
  try {
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    const manifestInput = join(consumer, 'manifest-input.json');
    await writeJson(manifestInput, {
      schemaVersion: 1,
      cases: syntaxContractCases,
      browserCaseIds: syntaxContractCases
        .filter((case_) => case_.modes.includes('precompiled'))
        .map((case_) => case_.id),
      property: { seed: '0x53494b4b', runs: 100, ids: PROPERTY_IDS },
    });
    await copyRuntimeFiles(consumer, output);
    const generated = runInstalled(consumer, ['--generate', manifestInput, output]);
    const manifest = JSON.parse(await readFile(manifestInput, 'utf8'));
    manifest.templates = generated.templates;
    manifest.templateFiles = generated.templateFiles;
    manifest.runtime = {
      bundle: 'sikka-runtime.mjs',
      runtime: 'runtime.js',
      escape: 'escape.js',
    };
    await writeJson(join(output, 'manifest.json'), manifest);

    const hashes = await hashArtifacts(candidate, output);
    await writeJson(join(output, 'hashes.json'), hashes);
    const validation = runInstalled(consumer, ['--validate', join(output, 'manifest.json')]);
    const report = {
      schemaVersion: 1,
      target: 'node',
      commit: process.env.GITHUB_SHA ?? gitCommit(),
      runId: process.env.GITHUB_RUN_ID ?? null,
      result: validation.ok ? 'success' : 'failure',
      nodeVersion: process.version,
      manifestHash: hashes.manifest.sha256,
      expectedCaseIds: validation.expectedCaseIds,
      completedCaseIds: validation.completedCaseIds,
      caseResults: validation.caseResults,
      propertySeed: validation.propertySeed,
      propertyRuns: validation.propertyRuns,
      expectedPropertyIds: validation.expectedPropertyIds,
      completedPropertyIds: validation.completedPropertyIds,
      hashes,
    };
    await writeJson(resolve(reportPath), report);
    if (!validation.ok) throw new Error(validation.failure ?? 'Candidate validation failed');
  } finally {
    await rm(consumer, { recursive: true, force: true });
  }
}

async function generateTemplates(manifestPath, output) {
  const { compile } = await import('sikka/precompile');
  const { templateFor, wrapPrecompiledModule } = await import(process.env.SIKKA_CORPUS_URL);
  const { cases } = JSON.parse(await readFile(manifestPath, 'utf8'));
  const templates = {};
  const templateFiles = [];
  for (const case_ of cases.filter((item) => item.modes.includes('precompiled'))) {
    const artifacts = compile(case_.id, { resolver: (request) => templateFor(case_, request) });
    const files = new Map(
      artifacts.map((artifact, index) => [artifact.id, `template-${index}.sikka.mjs`])
    );
    const caseDirectory = join(output, 'templates', case_.id);
    await mkdir(caseDirectory, { recursive: true });
    for (const artifact of artifacts) {
      const filename = files.get(artifact.id);
      if (!filename) throw new Error(`Missing browser filename for ${artifact.id}`);
      const file = join(caseDirectory, filename);
      const bundle = relative(dirname(file), join(output, 'sikka-runtime.mjs'));
      await writeFile(
        file,
        wrapPrecompiledModule(
          artifact,
          bundle.startsWith('.') ? bundle : `./${bundle}`,
          (id) => `./${files.get(id)}`
        )
      );
      templateFiles.push(relative(output, file));
    }
    const entry = files.get(case_.id);
    if (!entry) throw new Error(`Missing browser entry for ${case_.id}`);
    templates[case_.id] = `templates/${case_.id}/${entry}`;
  }
  process.stdout.write(JSON.stringify({ templates, templateFiles }));
}

async function validateCandidate(manifestPath) {
  const { Sikka } = await import('sikka');
  const { compile } = await import('sikka/precompile');
  const { PortableGenerator, PORTABLE_RUNS, PORTABLE_SEED, runPortableProperty } = await import(
    process.env.SIKKA_PORTABLE_URL
  );
  const { precompiledSikka, runSyntaxContractCase, sourceSikka } = await import(
    process.env.SIKKA_CORPUS_URL
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const modules = { Sikka, compile, runtimeUrl: import.meta.resolve('sikka/runtime') };
  const caseResults = [];
  let failure;
  for (const case_ of manifest.cases) {
    const result = await runSyntaxContractCase(case_, modules);
    caseResults.push(result);
    if (result.failure && !failure)
      failure = `${result.id} (${result.failure.mode}): ${result.failure.detail}`;
  }
  const completedCaseIds = caseResults
    .filter((result) => result.completedModes.length === result.modes.length)
    .map((result) => result.id);
  const completedPropertyIds = [];
  if (!failure) {
    try {
      await runPortableProperties({
        PortableGenerator,
        PORTABLE_RUNS,
        PORTABLE_SEED,
        runPortableProperty,
        modules,
        precompiledSikka,
        sourceSikka,
      });
      completedPropertyIds.push(...PROPERTY_IDS);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  }
  const result = {
    ok: !failure,
    failure,
    expectedCaseIds: manifest.cases.map((case_) => case_.id),
    completedCaseIds,
    caseResults,
    propertySeed: `0x${PORTABLE_SEED.toString(16)}`,
    propertyRuns: PORTABLE_RUNS,
    expectedPropertyIds: PROPERTY_IDS,
    completedPropertyIds,
  };
  process.stdout.write(JSON.stringify(result));
  if (failure) process.exitCode = 1;
}

async function runPortableProperties({
  PortableGenerator,
  PORTABLE_RUNS,
  PORTABLE_SEED,
  runPortableProperty,
  modules,
  precompiledSikka,
  sourceSikka,
}) {
  if (PORTABLE_SEED !== 0x53494b4b || PORTABLE_RUNS !== 100)
    throw new Error('Unexpected portable property configuration');
  const text = new PortableGenerator().string().filter((value) => value.length > 0);
  const props = new PortableGenerator().object({
    name: text,
    items: new PortableGenerator().array(text, 5),
  });
  const candidate = (id, template, components) => ({
    id,
    template,
    components,
    props: {},
    expectedHtml: '',
    modes: ['source', 'precompiled'],
  });
  const deterministic = candidate('property-render', '<p>{Astro.props.value}</p>');
  const deterministicSource = sourceSikka(deterministic, modules);
  const deterministicPrecompiled = await precompiledSikka(deterministic, modules);
  runPortableProperty('portable-deterministic-render', text, (value) => {
    const props_ = { value };
    const html = deterministicSource.render(deterministic.id, props_);
    equal(deterministicSource.render(deterministic.id, props_), html);
    equal(deterministicPrecompiled.render(deterministic.id, props_), html);
  });

  const staticCase = candidate('property-null-props', '<p>static</p>');
  const staticSource = sourceSikka(staticCase, modules);
  const staticPrecompiled = await precompiledSikka(staticCase, modules);
  runPortableProperty('portable-null-default-props', text, () => {
    const html = staticSource.render(staticCase.id);
    equal(staticSource.render(staticCase.id, {}), html);
    equal(staticPrecompiled.render(staticCase.id), html);
    equal(staticPrecompiled.render(staticCase.id, {}), html);
  });

  const body = '<p>{Astro.props.value}</p>';
  const plain = candidate('property-plain', body);
  const fenced = candidate('property-fenced', `---\n---\n${body}`);
  const plainSource = sourceSikka(plain, modules);
  const fencedSource = sourceSikka(fenced, modules);
  const plainPrecompiled = await precompiledSikka(plain, modules);
  const fencedPrecompiled = await precompiledSikka(fenced, modules);
  runPortableProperty('portable-frontmatter-equivalence', text, (value) => {
    const props_ = { value };
    const html = plainSource.render(plain.id, props_);
    equal(fencedSource.render(fenced.id, props_), html);
    equal(plainPrecompiled.render(plain.id, props_), html);
    equal(fencedPrecompiled.render(fenced.id, props_), html);
  });

  const list = candidate(
    'property-list',
    '<h1>{Astro.props.name}</h1><ul>{Astro.props.items.map((item) => <li>{item}</li>)}</ul>'
  );
  const listSource = sourceSikka(list, modules);
  const listPrecompiled = await precompiledSikka(list, modules);
  runPortableProperty('portable-escaping-list', props, (props_) => {
    const expected = `<h1>${escape(props_.name)}</h1><ul>${props_.items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>`;
    equal(listSource.render(list.id, props_), expected);
    equal(listPrecompiled.render(list.id, props_), expected);
  });

  const component = candidate(
    'property-component',
    '---\nimport Item from "./item.astro";\n---\n<Item text={Astro.props.left} /><Item text={Astro.props.right} />',
    { './item.astro': '<span>{Astro.props.text}</span>' }
  );
  const componentSource = sourceSikka(component, modules);
  const componentPrecompiled = await precompiledSikka(component, modules);
  const pairs = text.map((left) => ({ left, right: `${left}x` }));
  runPortableProperty('portable-component-isolation', pairs, (props_) => {
    const expected = `<span>${escape(props_.left)}</span><span>${escape(props_.right)}</span>`;
    equal(componentSource.render(component.id, props_), expected);
    equal(componentPrecompiled.render(component.id, props_), expected);
  });
}

async function installCandidate(tarball) {
  const directory = await mkdtemp(join(tmpdir(), 'sikka-candidate-'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
  run('npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-save', tarball], directory);
  await copyFile(SELF, join(directory, 'ci-candidate.mjs'));
  return directory;
}

function runInstalled(directory, childArguments) {
  const result = spawnSync(process.execPath, ['ci-candidate.mjs', ...childArguments], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, SIKKA_CORPUS_URL: CORPUS_URL, SIKKA_PORTABLE_URL: PORTABLE_URL },
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      result.stderr || result.stdout || 'Installed candidate produced no JSON report'
    );
  }
}

async function copyRuntimeFiles(consumer, output) {
  const source = join(consumer, 'node_modules', 'sikka', 'dist', 'esm');
  const runtime = await readFile(join(source, 'runtime.js'), 'utf8');
  const escapeSource = await readFile(join(source, 'escape.js'), 'utf8');
  const importLine = "import { escapeHtml, RawHtml, stringifyHtml } from './escape.js';\n";
  if (!runtime.startsWith(importLine)) throw new Error('Unexpected candidate runtime module');
  await writeFile(join(output, 'runtime.js'), runtime);
  await writeFile(join(output, 'escape.js'), escapeSource);
  await writeFile(
    join(output, 'sikka-runtime.mjs'),
    `${escapeSource}\n${runtime.slice(importLine.length)}`
  );
}

async function hashArtifacts(tarball, output) {
  const templates = {};
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  for (const path of manifest.templateFiles) templates[path] = await sha256(join(output, path));
  return {
    schemaVersion: 1,
    package: { file: basename(tarball), sha256: await sha256(tarball) },
    templates,
    browserBundle: {
      file: 'sikka-runtime.mjs',
      sha256: await sha256(join(output, 'sikka-runtime.mjs')),
    },
    runtime: { file: 'runtime.js', sha256: await sha256(join(output, 'runtime.js')) },
    escape: { file: 'escape.js', sha256: await sha256(join(output, 'escape.js')) },
    manifest: { file: 'manifest.json', sha256: await sha256(join(output, 'manifest.json')) },
  };
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, commandArguments, cwd) {
  const result = spawnSync(command, commandArguments, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
}

function gitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function equal(actual, expected) {
  if (actual !== expected)
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function escape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
