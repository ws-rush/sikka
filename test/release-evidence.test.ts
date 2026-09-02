import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const verifier = join(root, 'scripts/verify-release-evidence.mjs');
const csp = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'";

function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'sikka-release-evidence-'));
  const packageDirectory = join(directory, 'package');
  mkdirSync(packageDirectory);
  writeJson(join(packageDirectory, 'package.json'), { name: 'sikka', version: '1.0.0' });
  const tarball = join(directory, 'sikka-1.0.0.tgz');
  assert.equal(spawnSync('tar', ['-czf', tarball, '-C', directory, 'package']).status, 0);
  const hashes = {
    schemaVersion: 1,
    package: { file: 'sikka-1.0.0.tgz', sha256: hash(readFileSync(tarball)) },
    templates: { 'templates/case.sikka.mjs': hash('template') },
    browserBundle: { file: 'sikka-runtime.mjs', sha256: hash('bundle') },
    runtime: { file: 'runtime.js', sha256: hash('runtime') },
    escape: { file: 'escape.js', sha256: hash('escape') },
    manifest: { file: 'manifest.json', sha256: hash('manifest') },
  };
  const shared = {
    schemaVersion: 1,
    result: 'success',
    commit: 'a'.repeat(40),
    runId: '123',
    manifestHash: hashes.manifest.sha256,
    expectedCaseIds: ['case'],
    completedCaseIds: ['case'],
    propertySeed: '0x53494b4b',
    propertyRuns: 100,
    expectedPropertyIds: ['property'],
    completedPropertyIds: ['property'],
    hashes,
  };
  const node = { ...shared, target: 'node' };
  const browser = { ...shared, target: 'strict-csp-precompiled', csp };
  const aggregate = {
    ...shared,
    target: 'sikka-1.0-validation',
    completedTargetIds: ['node', 'strict-csp-precompiled'],
    targetResults: { node: 'success', 'strict-csp-precompiled': 'success' },
    reports: { node, 'strict-csp-precompiled': browser },
  };
  const evidence = join(directory, 'evidence');
  writeJson(join(evidence, 'node-report.json'), node);
  writeJson(join(evidence, 'browser-report.json'), browser);
  writeJson(join(evidence, 'aggregate.json'), aggregate);
  const changelog = join(directory, 'CHANGELOG.md');
  writeFileSync(changelog, '# Changelog\n\n## 1.0.0\n');
  return { directory, evidence, tarball, changelog, aggregate, browser };
}

function run(input: ReturnType<typeof fixture>, createdAt = new Date().toISOString()) {
  return spawnSync(
    process.execPath,
    [
      verifier,
      input.evidence,
      input.tarball,
      'a'.repeat(40),
      '123',
      createdAt,
      'v1.0.0',
      input.changelog,
    ],
    { encoding: 'utf8' }
  );
}

describe('release evidence verifier', () => {
  it('accepts the exact successful candidate and evidence', () => {
    const input = fixture();
    try {
      assert.equal(run(input).status, 0);
    } finally {
      rmSync(input.directory, { recursive: true, force: true });
    }
  });

  it('rejects tampered candidates, expired evidence, and incomplete targets', () => {
    for (const mutate of [
      (input: ReturnType<typeof fixture>) => writeFileSync(input.tarball, 'tampered'),
      (input: ReturnType<typeof fixture>) => rmSync(join(input.evidence, 'node-report.json')),
      (input: ReturnType<typeof fixture>) => input.aggregate.completedTargetIds.pop(),
      (input: ReturnType<typeof fixture>) => input.browser.completedCaseIds.pop(),
    ]) {
      const input = fixture();
      try {
        mutate(input);
        writeJson(join(input.evidence, 'aggregate.json'), input.aggregate);
        writeJson(join(input.evidence, 'browser-report.json'), input.browser);
        assert.notEqual(run(input).status, 0);
      } finally {
        rmSync(input.directory, { recursive: true, force: true });
      }
    }
    const input = fixture();
    try {
      assert.notEqual(run(input, '2000-01-01T00:00:00.000Z').status, 0);
    } finally {
      rmSync(input.directory, { recursive: true, force: true });
    }
  });
});
