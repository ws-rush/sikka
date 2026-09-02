console.error(
  'Local releases are disabled. Commit the version and CHANGELOG.md, then push its v<version> tag; GitHub Actions publishes only a fresh validated candidate.'
);
process.exitCode = 1;
