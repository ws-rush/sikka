# Contributing

Thank you for your interest in contributing to Sikka! This guide covers the development workflow, changelog, and release process.

## Development Setup

```bash
nub install
nub run build     # compile TypeScript to dist/
nub run test      # run the test suite
```

## Validation Pipeline

Sikka uses the latest TypeScript compiler, `oxfmt` for formatting, and `oxlint` for strict linting. Configuration is in `.oxfmtrc.json` and `.oxlintrc.json`.

Before submitting changes, ensure the full pipeline passes:

```bash
nub run format && nub run lint && nub run fallow && nub run typecheck && nub run test && nub run test:coverage
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for generating changelogs. Please follow this format:

```
<type>(<scope>): <description>
```

**Types:**

| Type       | Changelog section |
| ---------- | ----------------- |
| `feat`     | Features          |
| `fix`      | Bug Fixes         |
| `perf`     | Performance       |
| `docs`     | — (not included)  |
| `style`    | — (not included)  |
| `refactor` | — (not included)  |
| `test`     | — (not included)  |
| `chore`    | — (not included)  |

**Examples:**

```
feat(compiler): add support for spread attributes
fix(parser): handle unclosed frontmatter fence
perf(escape): optimize fast-path for ASCII strings
```

## Changelog

The changelog is generated automatically from commit messages using [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog) with the Angular preset.

To regenerate `CHANGELOG.md`:

```bash
nub run changelog
```

This reads git history and appends new entries to the top of `CHANGELOG.md`. It does **not** remove old entries.

## Release

After 1.0, the Stable application API, precompile API, generated-runtime ABI, public types, diagnostics context, and documented Supported syntax follow semantic versioning: breaking changes are major, compatible features are minor, and compatible fixes are patch releases. Intentionally rejected and explicitly unsupported behavior has no compatibility commitment until documented as Supported.

Node.js 24 and bundled Chromium are release-evidence targets, not runtime support promises. Record the target and candidate revision with any benchmark result; do not present it as a general performance claim.

Local publishing is disabled on purpose. `nub run release` intentionally exits nonzero with guidance; there is no interactive release flow.

### Release Flow

1. **Prepare the release commit** — set the version in `package.json` and add the matching `CHANGELOG.md` entry, then commit them (for example `release: v<version>`).
2. **Push and validate** — push the commit to `main` so the [Correctness](.github/workflows/correctness.yml) workflow produces a green `sikka-1.0-validation` aggregate for exactly that commit. This run packs the exact candidate tarball, executes the portable Syntax Contract corpus in Node and in bundled Chromium under strict CSP, and aggregates the evidence.
3. **Tag** — push a `v<version>` tag pointing at the release commit.
4. **Publish** — GitHub Actions [`publish.yml`](.github/workflows/publish.yml) runs for `v*` tags only. It requires a successful `sikka-1.0-validation` run for the exact tagged commit, no older than seven days, with exactly one non-expired evidence artifact and candidate tarball from that run. It re-verifies the evidence, candidate, tag, and `CHANGELOG.md` entry, then publishes the exact downloaded tarball with `npm publish --provenance`.

### Requirements

- The tagged commit must have a fresh (≤ 7 days) successful full validation run — retagging an old commit does not publish.
- The `CHANGELOG.md` must contain an entry for the released version; publication verifies it.
- Commit history should follow Conventional Commits for a meaningful changelog.

## Branching

- **`main`** — stable, released code. All releases are cut from `main`.
- Feature branches should be named `feat/<description>` or `fix/<description>`.
- Squash-merge PRs into `main` with a conventional commit message as the title.
