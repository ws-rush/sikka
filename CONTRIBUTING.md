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

> **Note:** The changelog is also generated automatically as part of the release script. You typically do not need to run this manually.

## Release

After 1.0, the Stable application API, precompile API, generated-runtime ABI, public types, diagnostics context, and documented Supported syntax follow semantic versioning: breaking changes are major, compatible features are minor, and compatible fixes are patch releases. Intentionally rejected and explicitly unsupported behavior has no compatibility commitment until documented as Supported.

Node.js 24 and bundled Chromium are release-evidence targets, not runtime support promises. Record the target and candidate revision with any benchmark result; do not present it as a general performance claim.

The release script handles version bumping, building, testing, changelog generation, and git tagging.

```bash
nub run release
```

### Release Flow

1. **Select version type** — choose `patch`, `minor`, `major`, or enter a `custom` version.
2. **Confirm** — verify the target version before proceeding.
3. **Update `package.json`** — the version field is updated.
4. **Build** — `nub run build` compiles the project.
5. **Test** — `nub run test` runs the full test suite.
6. **Generate changelog** — `CHANGELOG.md` is updated and formatted.
7. **Review changelog** — you'll be asked to confirm the changelog looks correct.
8. **Git commit + tag** — commits `package.json` and `CHANGELOG.md` with message `release: v<version>`, then creates tag `v<version>`.
9. **Push to GitHub** — pushes the commit and tag to `origin`.

### Requirements

- Clean working tree (no uncommitted changes).
- Commit history should follow Conventional Commits for a meaningful changelog.

## Branching

- **`main`** — stable, released code. All releases are cut from `main`.
- Feature branches should be named `feat/<description>` or `fix/<description>`.
- Squash-merge PRs into `main` with a conventional commit message as the title.
