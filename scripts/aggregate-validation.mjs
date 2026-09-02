#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { basename, relative, resolve } from 'node:path';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const CSP = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'";
const arguments_ = process.argv.slice(2);
if (arguments_[0] === '--') arguments_.shift();
if (arguments_.length !== 5)
  throw new Error(
    'Usage: aggregate-validation <candidate.tgz> <browser-artifacts-directory> <node-report.json> <browser-report.json> <evidence-directory>'
  );

const [candidateTarball, browserDirectory, nodeReportPath, browserReportPath, evidenceDirectory] =
  arguments_.map((value) => resolve(value));
const candidateManifest = await readJson(resolve(browserDirectory, 'manifest.json'));
const candidateHashes = await readJson(resolve(browserDirectory, 'hashes.json'));
const nodeReport = await readJson(nodeReportPath);
const browserReport = await readJson(browserReportPath);
const targetExpectation = await validateArtifacts(
  candidateTarball,
  browserDirectory,
  candidateManifest,
  candidateHashes
);
validateReports(nodeReport, browserReport, candidateHashes, targetExpectation);
await writeEvidence(evidenceDirectory, nodeReportPath, browserReportPath, {
  schemaVersion: 1,
  target: 'sikka-1.0-validation',
  result: 'success',
  commit: nodeReport.commit,
  runId: nodeReport.runId,
  nodeVersion: nodeReport.nodeVersion,
  playwrightVersion: browserReport.playwrightVersion,
  chromiumVersion: browserReport.chromiumVersion,
  hashes: candidateHashes,
  manifestHash: candidateHashes.manifest.sha256,
  expectedCaseIds: targetExpectation.caseIds,
  completedCaseIds: targetExpectation.caseIds,
  propertySeed: targetExpectation.property.seed,
  propertyRuns: targetExpectation.property.runs,
  expectedPropertyIds: targetExpectation.property.ids,
  completedPropertyIds: targetExpectation.property.ids,
  csp: browserReport.csp,
  completedTargetIds: ['node', 'strict-csp-precompiled'],
  targetResults: {
    node: nodeReport.result,
    'strict-csp-precompiled': browserReport.result,
  },
  reports: { node: nodeReport, 'strict-csp-precompiled': browserReport },
});

async function validateArtifacts(tarball, directory, manifest, hashes) {
  if (manifest?.schemaVersion !== 1 || hashes?.schemaVersion !== 1)
    throw new Error('Unexpected artifact schema version');
  const cases = ids(
    manifest.cases?.map((case_) => {
      if (!case_ || typeof case_.id !== 'string' || !Array.isArray(case_.modes))
        throw new Error('Malformed manifest case');
      return case_.id;
    }),
    'manifest case'
  );
  const caseModes = new Map(manifest.cases.map((case_) => [case_.id, case_.modes]));
  const caseIds = ids(manifest.browserCaseIds, 'browser case');
  if (!caseIds.length || !includesExactly(cases, caseIds))
    throw new Error('Missing or extra browser manifest case IDs');
  for (const id of caseIds)
    if (!caseModes.get(id).includes('precompiled'))
      throw new Error(`Non-precompiled browser case: ${id}`);

  const property = manifest.property;
  if (
    !property ||
    typeof property.seed !== 'string' ||
    !Number.isSafeInteger(property.runs) ||
    property.runs < 1
  )
    throw new Error('Malformed property configuration');
  const propertyIds = ids(property.ids, 'manifest property');
  if (!propertyIds.length) throw new Error('Missing manifest property IDs');

  const templateFiles = strings(manifest.templateFiles, 'manifest template path');
  const templates = manifest.templates;
  if (!templates || typeof templates !== 'object' || Array.isArray(templates))
    throw new Error('Malformed browser templates');
  if (!includesExactly(caseIds, Object.keys(templates)))
    throw new Error('Missing or extra browser templates');
  if (
    Object.values(templates).some(
      (path) => typeof path !== 'string' || !templateFiles.includes(path)
    )
  )
    throw new Error('Malformed browser template path');
  const propertyTemplates = manifest.propertyTemplates;
  if (
    !propertyTemplates ||
    typeof propertyTemplates !== 'object' ||
    Array.isArray(propertyTemplates)
  )
    throw new Error('Malformed browser property templates');
  if (!includesExactly(propertyIds, Object.keys(propertyTemplates)))
    throw new Error('Missing or extra browser property templates');
  for (const entries of Object.values(propertyTemplates))
    if (
      !entries ||
      typeof entries !== 'object' ||
      Array.isArray(entries) ||
      !Object.keys(entries).length ||
      Object.values(entries).some(
        (path) => typeof path !== 'string' || !templateFiles.includes(path)
      )
    )
      throw new Error('Malformed browser property template path');
  const hashFiles = validateHashes(hashes);
  if (!includesExactly([...new Set(templateFiles)], Object.keys(hashes.templates)))
    throw new Error('Generated template hashes disagree with manifest');
  if (hashes.package.file !== basename(tarball))
    throw new Error('Candidate package filename disagrees');
  for (const [file, hash] of hashFiles) {
    if (file === hashes.package.file) continue;
    const path = artifactPath(directory, file);
    if ((await sha256(path)) !== hash) throw new Error(`Artifact hash disagrees: ${file}`);
  }
  if ((await sha256(tarball)) !== hashes.package.sha256)
    throw new Error('Candidate package hash disagrees');
  return {
    caseIds,
    property: { seed: property.seed, runs: property.runs, ids: propertyIds },
    caseModes,
  };
}

function validateReports(node, browser, hashes, expected) {
  validateReportIdentity(node, 'node');
  validateReportIdentity(browser, 'strict-csp-precompiled');
  if (node.result !== 'success' || browser.result !== 'success')
    throw new Error('A target report did not succeed');
  if (node.commit !== browser.commit || node.runId !== browser.runId)
    throw new Error('Target commit or workflow run disagrees');
  if (
    (process.env.GITHUB_SHA && node.commit !== process.env.GITHUB_SHA) ||
    (process.env.GITHUB_RUN_ID && node.runId !== process.env.GITHUB_RUN_ID)
  )
    throw new Error('Target identity disagrees with this workflow run');
  if (
    node.manifestHash !== hashes.manifest.sha256 ||
    browser.manifestHash !== hashes.manifest.sha256
  )
    throw new Error('Target manifest hash disagrees');
  if (!sameValue(node.hashes, hashes) || !sameValue(browser.hashes, hashes))
    throw new Error('Target candidate hashes disagree');
  validateCompletion(node, expected, 'Node');
  validateCompletion(browser, expected, 'Browser');
  if (typeof node.nodeVersion !== 'string' || !node.nodeVersion)
    throw new Error('Incomplete Node target identity');
  if (
    typeof browser.playwrightVersion !== 'string' ||
    !browser.playwrightVersion ||
    typeof browser.chromiumVersion !== 'string' ||
    !browser.chromiumVersion ||
    browser.csp !== CSP
  )
    throw new Error('Incomplete or unexpected browser target identity');
  validateNodeCases(node.caseResults, expected.caseIds, expected.caseModes);
}

function validateReportIdentity(report, target) {
  if (
    report?.schemaVersion !== 1 ||
    report.target !== target ||
    typeof report.commit !== 'string' ||
    !report.commit ||
    typeof report.runId !== 'string' ||
    !report.runId
  )
    throw new Error(`Incomplete or malformed ${target} report identity`);
}

function validateCompletion(report, expected, label) {
  const expectedCases = ids(report.expectedCaseIds, `${label} expected case`);
  const completedCases = ids(report.completedCaseIds, `${label} completed case`);
  const expectedProperties = ids(report.expectedPropertyIds, `${label} expected property`);
  const completedProperties = ids(report.completedPropertyIds, `${label} completed property`);
  if (
    !includesExactly(expected.caseIds, expectedCases) ||
    !includesExactly(expected.caseIds, completedCases) ||
    !includesExactly(expected.property.ids, expectedProperties) ||
    !includesExactly(expected.property.ids, completedProperties)
  )
    throw new Error(`${label} case or property IDs are missing, extra, or duplicate`);
  if (
    report.propertySeed !== expected.property.seed ||
    report.propertyRuns !== expected.property.runs
  )
    throw new Error(`${label} property configuration disagrees`);
}

function validateNodeCases(results, expectedIds, expectedModes) {
  if (!Array.isArray(results)) throw new Error('Malformed Node case results');
  const seen = ids(
    results.map((result) => {
      if (!result || typeof result.id !== 'string') throw new Error('Malformed Node case result');
      const modes = ids(result.modes, `Node case ${result.id} mode`);
      const completed = ids(result.completedModes, `Node case ${result.id} completed mode`);
      if (
        !includesExactly(expectedModes.get(result.id) ?? [], modes) ||
        !includesExactly(modes, completed)
      )
        throw new Error(`Incomplete Node case result: ${result.id}`);
      return result.id;
    }),
    'Node case result'
  );
  if (!includesExactly(expectedIds, seen))
    throw new Error('Node case results are missing or extra');
}

function validateHashes(hashes) {
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes))
    throw new Error('Malformed artifact hashes');
  const files = new Map();
  const add = (record, label) => {
    if (
      !record ||
      typeof record.file !== 'string' ||
      !record.file ||
      typeof record.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.sha256) ||
      files.has(record.file)
    )
      throw new Error(`Malformed ${label} hash`);
    files.set(record.file, record.sha256);
  };
  add(hashes.package, 'package');
  add(hashes.browserBundle, 'browser bundle');
  add(hashes.runtime, 'runtime');
  add(hashes.escape, 'escape');
  add(hashes.manifest, 'manifest');
  if (!hashes.templates || typeof hashes.templates !== 'object' || Array.isArray(hashes.templates))
    throw new Error('Malformed generated template hashes');
  for (const [file, digest] of Object.entries(hashes.templates)) {
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest) || files.has(file))
      throw new Error('Malformed generated template hash');
    files.set(file, digest);
  }
  return files;
}

function ids(values, label) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || !value) ||
    values.length !== new Set(values).size
  )
    throw new Error(`Malformed or duplicate ${label} IDs`);
  return values;
}

function strings(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value))
    throw new Error(`Malformed ${label}`);
  return values;
}

function includesExactly(expected, actual) {
  return expected.length === actual.length && actual.every((id) => expected.includes(id));
}

function artifactPath(directory, path) {
  const file = resolve(directory, path);
  if (!path || relative(directory, file).startsWith('..'))
    throw new Error(`Invalid artifact path: ${path}`);
  return file;
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

async function writeEvidence(directory, nodePath, browserPath, record) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await copyFile(nodePath, resolve(directory, 'node-report.json'));
  await copyFile(browserPath, resolve(directory, 'browser-report.json'));
  await writeFile(resolve(directory, 'aggregate.json'), `${JSON.stringify(record, null, 2)}\n`);
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
