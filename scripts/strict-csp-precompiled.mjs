#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const CSP = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'";
const REPORT_TYPE = 'sikka-strict-csp-report';
const PORTABLE_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 &<>"\'';
const PROPERTY_ENTRIES = {
  'portable-deterministic-render': ['property-render'],
  'portable-null-default-props': ['property-null-props'],
  'portable-frontmatter-equivalence': ['property-plain', 'property-fenced'],
  'portable-escaping-list': ['property-list'],
  'portable-component-isolation': ['property-component'],
};
const require = createRequire(import.meta.url);

const arguments_ = process.argv.slice(2);
if (arguments_[0] === '--') arguments_.shift();
if (arguments_.length !== 4)
  throw new Error(
    'Usage: ci:strict-csp <candidate.tgz> <browser-artifacts-directory> <node-report.json> <browser-report.json>'
  );

const [candidateTarball, browserDirectory, nodeReportPath, reportPath] = arguments_.map((value) =>
  resolve(value)
);
const browserManifest = await readJson(resolve(browserDirectory, 'manifest.json'));
const artifactHashes = await readJson(resolve(browserDirectory, 'hashes.json'));
const candidateNodeReport = await readJson(nodeReportPath);
const expectedIds = validateInputs(
  candidateTarball,
  browserManifest,
  artifactHashes,
  candidateNodeReport
);
const artifactFiles = await verifiedFiles(browserDirectory, artifactHashes, candidateTarball);
const host = await server(browserDirectory, artifactFiles, worker(browserManifest, expectedIds));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(host.url, { waitUntil: 'load' });
  const report = await page.evaluate(() => window.strictCspReport);
  validateWorkerReport(report, expectedIds);
  await writeJson(reportPath, {
    schemaVersion: 1,
    target: 'strict-csp-precompiled',
    result: 'success',
    commit: candidateNodeReport.commit,
    runId: candidateNodeReport.runId,
    manifestHash: artifactHashes.manifest.sha256,
    expectedCaseIds: expectedIds.caseIds,
    completedCaseIds: report.completedCaseIds,
    propertySeed: browserManifest.property.seed,
    propertyRuns: browserManifest.property.runs,
    expectedPropertyIds: expectedIds.propertyIds,
    completedPropertyIds: report.completedPropertyIds,
    hashes: artifactHashes,
    csp: CSP,
    playwrightVersion: require('@playwright/test/package.json').version,
    chromiumVersion: browser.version(),
  });
} finally {
  await browser.close();
  await host.close();
}

function validateInputs(tarball, manifest, hashes, nodeReport) {
  if (
    manifest?.schemaVersion !== 1 ||
    hashes?.schemaVersion !== 1 ||
    nodeReport?.schemaVersion !== 1
  )
    throw new Error('Unexpected artifact schema version');
  if (nodeReport.target !== 'node' || nodeReport.result !== 'success')
    throw new Error('Node candidate report did not succeed');
  if (!nodeReport.commit || nodeReport.commit !== (process.env.GITHUB_SHA ?? nodeReport.commit))
    throw new Error('Candidate commit identity disagrees');
  if (nodeReport.manifestHash !== hashes.manifest?.sha256 || !sameJson(nodeReport.hashes, hashes))
    throw new Error('Node report candidate hashes disagree');
  if (hashes.package?.file !== basename(tarball) || !hashes.package.sha256)
    throw new Error('Candidate tarball identity disagrees');
  if (!Array.isArray(manifest.cases) || !Array.isArray(manifest.browserCaseIds))
    throw new Error('Malformed browser manifest cases');
  const cases = new Map();
  for (const case_ of manifest.cases) {
    if (!case_ || typeof case_.id !== 'string' || typeof case_.expectedHtml !== 'string')
      throw new Error('Malformed browser manifest case');
    if (cases.has(case_.id)) throw new Error(`Duplicate manifest case ID: ${case_.id}`);
    cases.set(case_.id, case_);
  }
  const caseIds = unique(manifest.browserCaseIds, 'browser case');
  if (!caseIds.length || !sameIds(caseIds, Object.keys(manifest.templates ?? {})))
    throw new Error('Manifest browser template IDs disagree');
  for (const id of caseIds) {
    const case_ = cases.get(id);
    if (!case_?.modes?.includes('precompiled'))
      throw new Error(`Non-precompiled browser case: ${id}`);
    if (typeof manifest.templates[id] !== 'string')
      throw new Error(`Missing browser template: ${id}`);
  }
  if (
    !manifest.property ||
    manifest.property.seed !== '0x53494b4b' ||
    manifest.property.runs !== 100
  )
    throw new Error('Unexpected portable property configuration');
  const propertyIds = unique(manifest.property.ids, 'property');
  if (!sameIds(propertyIds, Object.keys(PROPERTY_ENTRIES)))
    throw new Error('Unexpected property IDs');
  if (!sameIds(propertyIds, Object.keys(manifest.propertyTemplates ?? {})))
    throw new Error('Missing browser property templates');
  for (const id of propertyIds) {
    const entries = manifest.propertyTemplates[id];
    if (!entries || !sameIds(Object.keys(entries), PROPERTY_ENTRIES[id]))
      throw new Error(`Malformed property templates: ${id}`);
    if (Object.values(entries).some((path) => typeof path !== 'string'))
      throw new Error(`Malformed property template path: ${id}`);
  }
  if (
    !sameIds(nodeReport.expectedCaseIds, caseIds) ||
    !sameIds(nodeReport.completedCaseIds, caseIds)
  )
    throw new Error('Node case IDs disagree with browser manifest');
  if (
    nodeReport.propertySeed !== manifest.property.seed ||
    nodeReport.propertyRuns !== manifest.property.runs ||
    !sameIds(nodeReport.expectedPropertyIds, propertyIds) ||
    !sameIds(nodeReport.completedPropertyIds, propertyIds)
  )
    throw new Error('Node property evidence disagrees with browser manifest');
  return { caseIds, propertyIds };
}

async function verifiedFiles(directory, hashes, tarball) {
  const expected = new Map();
  const add = (entry) => {
    if (!entry?.file || !entry.sha256 || expected.has(entry.file))
      throw new Error('Malformed artifact hash record');
    expected.set(entry.file, entry.sha256);
  };
  add(hashes.manifest);
  add(hashes.browserBundle);
  add(hashes.runtime);
  add(hashes.escape);
  for (const [path, sha256] of Object.entries(hashes.templates ?? {})) {
    if (typeof sha256 !== 'string' || expected.has(path))
      throw new Error('Malformed template hash');
    expected.set(path, sha256);
  }
  for (const [path, sha256] of expected) {
    const file = artifactPath(directory, path);
    if ((await sha256File(file)) !== sha256) throw new Error(`Artifact hash disagrees: ${path}`);
  }
  if ((await sha256File(tarball)) !== hashes.package.sha256)
    throw new Error('Candidate package hash disagrees');
  return expected;
}

async function server(directory, files, workerSource) {
  const instance = createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      let body;
      let type = 'text/javascript';
      if (path === '/') {
        body = '<script type="module" src="/controller.mjs"></script>';
        type = 'text/html';
      } else if (path === '/controller.mjs') body = controller();
      else if (path === '/worker.mjs') body = workerSource;
      else if (path.startsWith('/artifacts/')) {
        const artifact = path.slice('/artifacts/'.length);
        if (!files.has(artifact)) throw new Error('Unknown artifact');
        body = await readFile(artifactPath(directory, artifact));
      } else throw new Error('Not found');
      response.writeHead(200, { 'content-security-policy': CSP, 'content-type': type });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-security-policy': CSP });
      response.end();
    }
  });
  await new Promise((resolve_, reject) =>
    instance.listen(0, '127.0.0.1', resolve_).once('error', reject)
  );
  const address = instance.address();
  if (!address || typeof address === 'string') throw new Error('Could not start localhost server');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve_, reject) =>
        instance.close((error) => (error ? reject(error) : resolve_()))
      ),
  };
}

function controller() {
  return `window.strictCspReport = new Promise((resolve, reject) => {
  let reports = 0;
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for service worker report')), 15000);
  navigator.serviceWorker.addEventListener('message', ({ data }) => {
    reports += 1;
    if (!data || data.type !== ${JSON.stringify(REPORT_TYPE)}) return reject(new Error('Malformed service worker report'));
    setTimeout(() => reports === 1 ? (clearTimeout(timeout), resolve(data)) : reject(new Error('Duplicate service worker report')), 50);
  });
  (async () => {
    const registration = await navigator.serviceWorker.register('/worker.mjs', { type: 'module' });
    const active = (await navigator.serviceWorker.ready).active ?? registration.active;
    if (!active) throw new Error('Service worker did not activate');
    active.postMessage({ type: ${JSON.stringify(REPORT_TYPE)} });
  })().catch((error) => (clearTimeout(timeout), reject(error)));
});`;
}

function worker(manifest, expected) {
  const imports = ["import { RUNTIME_ABI_VERSION, runtime } from '/artifacts/sikka-runtime.mjs';"];
  const modules = [];
  let index = 0;
  for (const id of expected.caseIds) {
    const name = `case_${index++}`;
    imports.push(
      `import * as ${name} from ${JSON.stringify(`/artifacts/${manifest.templates[id]}`)};`
    );
    modules.push({ id, name });
  }
  const properties = [];
  for (const id of expected.propertyIds)
    for (const entry of PROPERTY_ENTRIES[id]) {
      const name = `property_${index++}`;
      imports.push(
        `import * as ${name} from ${JSON.stringify(`/artifacts/${manifest.propertyTemplates[id][entry]}`)};`
      );
      properties.push({ id, entry, name });
    }
  const cases = modules.map(({ id, name }) => ({
    ...manifest.cases.find((case_) => case_.id === id),
    module: name,
  }));
  return `${imports.join('\n')}
const REPORT_TYPE = ${JSON.stringify(REPORT_TYPE)};
const CASES = [${cases.map((case_) => `{ id: ${JSON.stringify(case_.id)}, props: ${JSON.stringify(case_.props)}, expectedHtml: ${JSON.stringify(case_.expectedHtml)}, streaming: ${JSON.stringify(case_.streaming ?? null)}, autoEscape: ${JSON.stringify(case_.autoEscape)}, module: ${case_.module} }`).join(',')}];
const PROPERTIES = {${properties.map(({ id, entry, name }) => `${JSON.stringify(`${id}:${entry}`)}: ${name}`).join(',')}};
const EXPECTED_CASE_IDS = ${JSON.stringify(expected.caseIds)};
const EXPECTED_PROPERTY_IDS = ${JSON.stringify(expected.propertyIds)};

self.addEventListener('message', (event) => {
  event.waitUntil((async () => {
    const report = { type: REPORT_TYPE, result: 'failure', completedCaseIds: [], completedPropertyIds: [] };
    try {
      if (event.data?.type !== REPORT_TYPE || typeof runtime !== 'function' || RUNTIME_ABI_VERSION !== 3)
        throw new Error('Unexpected service worker runtime ABI');
      for (const current of CASES) {
        const receiver = { autoEscape: current.autoEscape };
        let rendered;
        if (current.streaming === 'await-only') {
          try { rendered = current.module.render.call(receiver, current.props); } catch (error) {
            if (/Sikka Frontmatter await.*stream/.test(String(error))) rendered = undefined;
            else throw error;
          }
          if (rendered !== undefined) throw new Error('Await-only case rendered regularly: ' + current.id);
        } else {
          rendered = current.module.render.call(receiver, current.props);
          if (rendered !== current.expectedHtml) throw new Error('Rendered unexpected HTML: ' + current.id);
        }
        const streamed = await collect(current.module.stream.call(receiver, current.props));
        if (streamed !== current.expectedHtml || (rendered !== undefined && streamed !== rendered))
          throw new Error('Streaming parity failed: ' + current.id);
        report.completedCaseIds.push(current.id);
      }
      await runProperties(report.completedPropertyIds);
      assertIds(report.completedCaseIds, EXPECTED_CASE_IDS, 'case');
      assertIds(report.completedPropertyIds, EXPECTED_PROPERTY_IDS, 'property');
      report.result = 'success';
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
    }
    if (!event.source) throw new Error('Missing service worker client');
    event.source.postMessage(report);
  })());
});

async function collect(stream) { let html = ''; for await (const chunk of stream) html += chunk; return html; }
function rendered(module, props) { return module.render.call({}, props); }
async function parity(module, props) { const html = rendered(module, props); if (await collect(module.stream.call({}, props)) !== html) throw new Error('Property streaming parity failed'); return html; }
function escape(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function next(state, minimum, maximum) { state.value ^= state.value << 13; state.value ^= state.value >>> 17; state.value ^= state.value << 5; state.value >>>= 0; return minimum + state.value % (maximum - minimum + 1); }
function string(state, minimum = 0, maximum = 20) { const characters = ${JSON.stringify(PORTABLE_CHARACTERS)}; let value = ''; for (let index = 0, length = next(state, minimum, maximum); index < length; index++) value += characters[next(state, 0, characters.length - 1)]; return value; }
function nonEmptyText(state) { for (let attempt = 0; attempt < 100; attempt++) { const value = string(state); if (value.length > 0) return value; } throw new Error('Portable domain predicate did not match'); }
async function runs(callback) { const state = { value: 0x53494b4b }; for (let run = 1; run <= 100; run++) await callback(state, run); }
async function runProperties(completed) {
  await runs(async (state) => { const value = nonEmptyText(state); const module = PROPERTIES['portable-deterministic-render:property-render']; const html = rendered(module, { value }); if (rendered(module, { value }) !== html) throw new Error('Portable property deterministic render failed'); await parity(module, { value }); }); completed.push('portable-deterministic-render');
  await runs(async (state) => { nonEmptyText(state); const module = PROPERTIES['portable-null-default-props:property-null-props']; if (rendered(module) !== rendered(module, {})) throw new Error('Portable property null default props failed'); await parity(module, {}); }); completed.push('portable-null-default-props');
  await runs(async (state) => { const value = nonEmptyText(state); const plain = PROPERTIES['portable-frontmatter-equivalence:property-plain']; const fenced = PROPERTIES['portable-frontmatter-equivalence:property-fenced']; if (rendered(plain, { value }) !== rendered(fenced, { value })) throw new Error('Portable property frontmatter equivalence failed'); await parity(plain, { value }); await parity(fenced, { value }); }); completed.push('portable-frontmatter-equivalence');
  await runs(async (state) => { const name = nonEmptyText(state); const items = Array.from({ length: next(state, 0, 5) }, () => nonEmptyText(state)); const module = PROPERTIES['portable-escaping-list:property-list']; const html = rendered(module, { name, items }); if (html !== '<h1>' + escape(name) + '</h1><ul>' + items.map((item) => '<li>' + escape(item) + '</li>').join('') + '</ul>') throw new Error('Portable property escaping list failed'); await parity(module, { name, items }); }); completed.push('portable-escaping-list');
  await runs(async (state) => { const left = nonEmptyText(state); const right = left + 'x'; const module = PROPERTIES['portable-component-isolation:property-component']; const html = rendered(module, { left, right }); if (html !== '<span>' + escape(left) + '</span><span>' + escape(right) + '</span>') throw new Error('Portable property component isolation failed'); await parity(module, { left, right }); }); completed.push('portable-component-isolation');
}
function assertIds(actual, expected, label) { if (actual.length !== new Set(actual).size || actual.length !== expected.length || actual.some((id) => !expected.includes(id))) throw new Error('Completed ' + label + ' IDs disagree'); }
`;
}

function validateWorkerReport(report, expected) {
  if (!report || report.type !== REPORT_TYPE || report.result !== 'success')
    throw new Error(report?.error || 'Service worker assertion failed');
  assertIds(report.completedCaseIds, expected.caseIds, 'completed case');
  assertIds(report.completedPropertyIds, expected.propertyIds, 'completed property');
}

function unique(values, label) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string') ||
    values.length !== new Set(values).size
  )
    throw new Error(`Malformed or duplicate ${label} IDs`);
  return values;
}

function sameIds(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((id) => expected.includes(id))
  );
}

function assertIds(actual, expected, label) {
  if (!sameIds(actual, expected)) throw new Error(`Missing, extra, or duplicate ${label} IDs`);
}

function artifactPath(directory, path) {
  const file = resolve(directory, path);
  if (!path || relative(directory, file).startsWith('..'))
    throw new Error(`Invalid artifact path: ${path}`);
  return file;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function sha256File(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
