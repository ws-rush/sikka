const fs = require('fs');
const path = require('path');
const chalk = require('chalk').default;
const semver = require('semver');
const { prompt } = require('enquirer');
const { execa } = require('execa');
const currentVersion = require('../package.json').version;

const versionIncrements = ['patch', 'minor', 'major'];

const inc = (i) => semver.inc(currentVersion, i);
const run = (bin, args, opts = {}) => execa(bin, args, { stdio: 'inherit', ...opts });
const quiet = (bin, args) => execa(bin, args);
const step = (msg) => console.log(chalk.cyan(msg));

async function main() {
  let targetVersion;

  const { release } = await prompt({
    type: 'select',
    name: 'release',
    message: 'Select release type',
    choices: versionIncrements.map((i) => `${i} (${inc(i)})`).concat(['custom']),
  });

  if (release === 'custom') {
    targetVersion = (
      await prompt({
        type: 'input',
        name: 'version',
        message: 'Input custom version',
        initial: currentVersion,
      })
    ).version;
  } else {
    targetVersion = release.match(/\((.*)\)/)[1];
  }

  if (!semver.valid(targetVersion)) {
    throw new Error(`Invalid target version: ${targetVersion}`);
  }

  const { yes: tagOk } = await prompt({
    type: 'confirm',
    name: 'yes',
    message: `Releasing v${targetVersion}. Confirm?`,
  });

  if (!tagOk) {
    return;
  }

  // Update the package version.
  step('\nUpdating the package version...');
  updatePackage(targetVersion);

  // Build the package.
  step('\nBuilding the package...');
  await run('nub', ['run', 'build']);

  // Generate the changelog.
  step('\nGenerating the changelog...');
  await run('nub', ['run', 'changelog']);
  await run('nub', ['run', 'format']);

  const { yes: changelogOk } = await prompt({
    type: 'confirm',
    name: 'yes',
    message: 'Changelog generated. Does it look good?',
  });

  if (!changelogOk) {
    return;
  }

  // Commit changes to the Git and create a tag.
  step('\nCommitting changes...');
  await run('git', ['add', 'CHANGELOG.md', 'package.json']);
  await run('git', ['commit', '-m', `release: v${targetVersion}`]);
  await run('git', ['tag', `v${targetVersion}`]);

  // Push main, then wait for green validation before the tag: publish.yml only
  // releases a commit backed by fresh successful correctness evidence.
  step('\nPushing to GitHub...');
  await run('git', ['push']);
  await waitForCorrectness();

  // Publishing the tag is the release button — GitHub Actions publishes the
  // validated candidate with provenance. No local npm publish.
  step('\nPublishing (pushing the release tag)...');
  await run('git', ['push', 'origin', `refs/tags/v${targetVersion}`]);
  step(`\nDone. v${targetVersion} is publishing at https://github.com/ws-rush/sikka/actions`);
}

async function waitForCorrectness() {
  const sha = (await quiet('git', ['rev-parse', 'HEAD'])).stdout.trim();
  step('\nWaiting for the Correctness workflow on the release commit...');
  for (let attempt = 0; attempt < 80; attempt++) {
    const list = await quiet('gh', [
      'run',
      'list',
      '--workflow',
      'correctness.yml',
      '--branch',
      'main',
      '--limit',
      '10',
      '--json',
      'databaseId,headSha,status,conclusion',
    ]);
    const workflowRun = JSON.parse(list.stdout).find((entry) => entry.headSha === sha);
    if (workflowRun?.status === 'completed') {
      if (workflowRun.conclusion !== 'success') {
        throw new Error('Correctness workflow failed — release tag NOT pushed');
      }
      step('Correctness passed.');
      return;
    }
    process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error(
    'Timed out waiting for the Correctness workflow — push the tag manually once green'
  );
}

function updatePackage(version) {
  const root = path.resolve(__dirname, '..');
  const pkgPath = path.resolve(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

main().catch((err) => console.error(err));
