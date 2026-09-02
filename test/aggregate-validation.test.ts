import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const aggregate = join(root, 'scripts/aggregate-validation.mjs');
const csp = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'";

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function run(directory: string, nodeReport: string, browserReport: string, evidence: string) {
  return spawnSync(
    process.execPath,
    [
      aggregate,
      join(directory, 'sikka-1.0.tgz'),
      join(directory, 'browser'),
      nodeReport,
      browserReport,
      evidence,
    ],
    { stdio: 'ignore' }
  );
}

describe('aggregate validation evidence', () => {
  it('rejects duplicate, missing, and tampered target report data without writing evidence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sikka-aggregate-'));
    try {
      const tarball = join(directory, 'sikka-1.0.tgz');
      const browser = join(directory, 'browser');
      const files = {
        'sikka-runtime.mjs': 'bundle',
        'runtime.js': 'runtime',
        'escape.js': 'escape',
        'templates/case.sikka.mjs': 'template',
      };
      writeFileSync(tarball, 'candidate');
      for (const [path, value] of Object.entries(files)) {
        const file = join(browser, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, value);
      }
      const manifest = {
        schemaVersion: 1,
        cases: [{ id: 'case', modes: ['precompiled'] }],
        browserCaseIds: ['case'],
        property: { seed: 'seed', runs: 1, ids: ['property'] },
        templates: { case: 'templates/case.sikka.mjs' },
        propertyTemplates: { property: { entry: 'templates/case.sikka.mjs' } },
        templateFiles: ['templates/case.sikka.mjs'],
      };
      writeJson(join(browser, 'manifest.json'), manifest);
      const hashes = {
        schemaVersion: 1,
        package: { file: 'sikka-1.0.tgz', sha256: hash('candidate') },
        templates: { 'templates/case.sikka.mjs': hash('template') },
        browserBundle: { file: 'sikka-runtime.mjs', sha256: hash('bundle') },
        runtime: { file: 'runtime.js', sha256: hash('runtime') },
        escape: { file: 'escape.js', sha256: hash('escape') },
        manifest: {
          file: 'manifest.json',
          sha256: hash(readFileSync(join(browser, 'manifest.json'))),
        },
      };
      writeJson(join(browser, 'hashes.json'), hashes);
      const report = (target: string) => ({
        schemaVersion: 1,
        target,
        result: 'success',
        commit: 'commit',
        runId: 'run',
        manifestHash: hashes.manifest.sha256,
        expectedCaseIds: ['case'],
        completedCaseIds: ['case'],
        propertySeed: 'seed',
        propertyRuns: 1,
        expectedPropertyIds: ['property'],
        completedPropertyIds: ['property'],
        hashes: JSON.parse(JSON.stringify(hashes)),
      });
      const node = {
        ...report('node'),
        nodeVersion: 'v24.0.0',
        caseResults: [{ id: 'case', modes: ['precompiled'], completedModes: ['precompiled'] }],
      };
      const browserReport = {
        ...report('strict-csp-precompiled'),
        playwrightVersion: '1.0.0',
        chromiumVersion: '1.0.0',
        csp,
      };
      const nodePath = join(directory, 'node.json');
      const browserPath = join(directory, 'browser.json');
      writeJson(nodePath, node);
      writeJson(browserPath, browserReport);
      assert.equal(run(directory, nodePath, browserPath, join(directory, 'success')).status, 0);

      for (const [name, mutate] of [
        ['duplicate', (report_: typeof node) => report_.completedCaseIds.push('case')],
        ['missing', (report_: typeof browserReport) => report_.completedPropertyIds.pop()],
        [
          'tampered',
          (report_: typeof browserReport) => {
            report_.hashes.package.sha256 = '0'.repeat(64);
          },
        ],
      ] as const) {
        const currentNode = structuredClone(node);
        const currentBrowser = structuredClone(browserReport);
        if (name === 'duplicate') mutate(currentNode);
        else mutate(currentBrowser);
        const currentNodePath = join(directory, `${name}-node.json`);
        const currentBrowserPath = join(directory, `${name}-browser.json`);
        const evidence = join(directory, `${name}-evidence`);
        writeJson(currentNodePath, currentNode);
        writeJson(currentBrowserPath, currentBrowser);
        assert.notEqual(run(directory, currentNodePath, currentBrowserPath, evidence).status, 0);
        assert.equal(existsSync(evidence), false);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
