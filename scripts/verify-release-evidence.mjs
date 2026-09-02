#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const CSP = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'";
const MAX_EVIDENCE_AGE = 7 * 24 * 60 * 60 * 1000;
const arguments_ = process.argv.slice(2);
if (arguments_[0] === '--') arguments_.shift();
if (arguments_.length !== 7)
  throw new Error(
    'Usage: verify-release-evidence <evidence-directory> <candidate.tgz> <commit> <run-id> <created-at> <tag> <CHANGELOG.md>'
  );

const [evidenceDirectory, candidateTarball, commit, runId, createdAt, tag, changelog] = arguments_;
const evidence = await readEvidence(resolve(evidenceDirectory));
validateFreshness(createdAt);
validateEvidence(evidence, commit, runId);
const packageJson = readPackage(candidateTarball);
await validatePackage(packageJson, resolve(candidateTarball), evidence.aggregate.hashes, tag);
await validateChangelog(resolve(changelog), packageJson.version);

async function readEvidence(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const expected = ['aggregate.json', 'browser-report.json', 'node-report.json'];
  if (
    entries.length !== expected.length ||
    entries.some((entry) => !entry.isFile() || !expected.includes(entry.name))
  )
    throw new Error('Validation evidence must contain exactly its three schema-v1 reports');
  return {
    aggregate: await readJson(resolve(directory, 'aggregate.json')),
    browser: await readJson(resolve(directory, 'browser-report.json')),
    node: await readJson(resolve(directory, 'node-report.json')),
  };
}

function validateFreshness(value) {
  const created = Date.parse(value);
  if (!Number.isFinite(created)) throw new Error('Validation run has no valid creation time');
  const age = Date.now() - created;
  if (age < -5 * 60 * 1000 || age > MAX_EVIDENCE_AGE)
    throw new Error('Validation evidence is expired or has an invalid future timestamp');
}

function validateEvidence({ aggregate, browser, node }, expectedCommit, expectedRunId) {
  if (
    aggregate?.schemaVersion !== 1 ||
    aggregate.target !== 'sikka-1.0-validation' ||
    aggregate.result !== 'success' ||
    aggregate.commit !== expectedCommit ||
    aggregate.runId !== expectedRunId
  )
    throw new Error('Aggregate identity or result disagrees with the release validation run');
  validateReport(node, 'node', aggregate, expectedCommit, expectedRunId);
  validateReport(browser, 'strict-csp-precompiled', aggregate, expectedCommit, expectedRunId);
  if (browser.csp !== CSP) throw new Error('Browser report has an unexpected CSP');
  if (
    !sameValue(aggregate.reports, { node, 'strict-csp-precompiled': browser }) ||
    !sameValue(aggregate.targetResults, { node: 'success', 'strict-csp-precompiled': 'success' }) ||
    !sameIds(aggregate.completedTargetIds, ['node', 'strict-csp-precompiled'])
  )
    throw new Error('Aggregate target reports are incomplete or disagree');
  const hashes = validateHashes(aggregate.hashes);
  if (aggregate.manifestHash !== hashes.manifest.sha256)
    throw new Error('Aggregate manifest hash disagrees');
  validateCompletion(aggregate, aggregate, 'Aggregate');
  for (const report of [node, browser]) validateCompletion(report, aggregate, report.target);
}

function validateReport(report, target, aggregate, expectedCommit, expectedRunId) {
  if (
    report?.schemaVersion !== 1 ||
    report.target !== target ||
    report.result !== 'success' ||
    report.commit !== expectedCommit ||
    report.runId !== expectedRunId ||
    report.manifestHash !== aggregate.manifestHash ||
    !sameValue(report.hashes, aggregate.hashes)
  )
    throw new Error(`${target} report disagrees with aggregate evidence`);
}

function validateCompletion(report, aggregate, label) {
  for (const field of ['CaseIds', 'PropertyIds']) {
    const expected = aggregate[`expected${field}`];
    if (
      !sameIds(expected, aggregate[`completed${field}`]) ||
      !sameIds(expected, report[`expected${field}`]) ||
      !sameIds(expected, report[`completed${field}`])
    )
      throw new Error(`${label} case or property IDs are incomplete`);
  }
  if (
    report.propertySeed !== aggregate.propertySeed ||
    report.propertyRuns !== aggregate.propertyRuns ||
    typeof aggregate.propertySeed !== 'string' ||
    !Number.isSafeInteger(aggregate.propertyRuns) ||
    aggregate.propertyRuns < 1
  )
    throw new Error(`${label} property configuration disagrees`);
}

function validateHashes(hashes) {
  if (hashes?.schemaVersion !== 1) throw new Error('Unexpected artifact hash schema version');
  const files = new Set();
  const record = (value, label) => {
    if (
      !value ||
      typeof value.file !== 'string' ||
      !value.file ||
      typeof value.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.sha256) ||
      files.has(value.file)
    )
      throw new Error(`Malformed ${label} hash`);
    files.add(value.file);
  };
  record(hashes.package, 'package');
  record(hashes.browserBundle, 'browser bundle');
  record(hashes.runtime, 'runtime');
  record(hashes.escape, 'escape');
  record(hashes.manifest, 'manifest');
  if (!hashes.templates || typeof hashes.templates !== 'object' || Array.isArray(hashes.templates))
    throw new Error('Malformed generated template hashes');
  const templates = Object.entries(hashes.templates);
  if (!templates.length) throw new Error('Missing generated template hashes');
  for (const [file, digest] of templates) {
    if (typeof file !== 'string' || !file || !/^[a-f0-9]{64}$/.test(digest) || files.has(file))
      throw new Error('Malformed generated template hash');
    files.add(file);
  }
  return hashes;
}

function readPackage(tarball) {
  const listing = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
  if (
    listing.status !== 0 ||
    listing.stdout.split('\n').filter((file) => file === 'package/package.json').length !== 1
  )
    throw new Error('Candidate tarball does not contain exactly one package/package.json');
  const result = spawnSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Could not read candidate package metadata');
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('Candidate package metadata is malformed', { cause: error });
  }
}

function validatePackage(pkg, tarball, hashes, expectedTag) {
  if (
    pkg?.name !== 'sikka' ||
    typeof pkg.version !== 'string' ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version) ||
    expectedTag !== `v${pkg.version}` ||
    hashes.package.file !== basename(tarball) ||
    basename(tarball) !== `sikka-${pkg.version}.tgz`
  )
    throw new Error('Candidate package identity, version, tag, or evidence filename disagrees');
  return sha256(tarball).then((digest) => {
    if (digest !== hashes.package.sha256)
      throw new Error('Candidate tarball hash disagrees with evidence');
  });
}

async function validateChangelog(path, version) {
  const contents = await readFile(path, 'utf8');
  const heading = new RegExp(`^##\\s+(?:\\[)?v?${escapeRegExp(version)}(?:\\])?(?:\\s|\\(|$)`, 'm');
  if (!heading.test(contents)) throw new Error(`CHANGELOG.md has no entry for ${version}`);
}

function sameIds(left, right) {
  return (
    Array.isArray(left) &&
    left.length > 0 &&
    left.length === new Set(left).size &&
    left.every((value) => typeof value === 'string' && value) &&
    Array.isArray(right) &&
    left.length === right.length &&
    right.length === new Set(right).size &&
    right.every((value) => left.includes(value))
  );
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse JSON: ${path}`, { cause: error });
  }
}

function sameValue(left, right) {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((key) => [key, sortValue(value[key])])
    );
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
