# Contributing

Thank you for your interest in contributing to Sikka! This guide covers the development workflow, including how to use the changelog, release, and publish to JSR.

## Development Setup

```bash
pnpm install
pnpm build     # compile TypeScript to dist/
pnpm test      # run the test suite
```

## Validation Pipeline

Before submitting changes, ensure the full pipeline passes:

```bash
pnpm format && pnpm lint && pnpm knip && pnpm typecheck && pnpm test && pnpm test:coverage
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
pnpm changelog
```

This reads git history and appends new entries to the top of `CHANGELOG.md`. It does **not** remove old entries.

> **Note:** The changelog is also generated automatically as part of the release script. You typically do not need to run this manually.

## Release

The release script handles version bumping, building, testing, changelog generation, and git tagging.

```bash
pnpm release
```

### Release Flow

1. **Select version type** — choose `patch`, `minor`, `major`, or enter a `custom` version.
2. **Confirm** — verify the target version before proceeding.
3. **Update `package.json`** — the version field is updated.
4. **Build** — `pnpm build` compiles the project.
5. **Test** — `pnpm test` runs the full test suite.
6. **Generate changelog** — `CHANGELOG.md` is updated and formatted.
7. **Review changelog** — you'll be asked to confirm the changelog looks correct.
8. **Git commit + tag** — commits `package.json` and `CHANGELOG.md` with message `release: v<version>`, then creates tag `v<version>`.
9. **Push to GitHub** — pushes the commit and tag to `origin`.

### Requirements

- Clean working tree (no uncommitted changes).
- Commit history should follow Conventional Commits for a meaningful changelog.

## Publishing to JSR

After the release script pushes the tag to GitHub, publish the package to [JSR](https://jsr.io):

### 1. Configure `jsr.json`

A `jsr.json` file must exist at the project root with `name`, `version`, `license`, and `exports` fields:

```json
{
  "name": "@rush/sikka",
  "version": "0.1.0",
  "license": "MIT",
  "exports": "./dist/esm/index.js"
}
```

The version must be in [SemVer](https://semver.org/) format. The `exports` field specifies the entry point of the package.

### 2. Publish

Publish from the terminal:

```bash
npx jsr publish
```

Or with Deno:

```bash
deno publish
```

You will be prompted to interactively authenticate in your browser on first use.

If the working tree is dirty (e.g. after a release commit), use:

```bash
npx jsr publish --allow-dirty
```

### Full Release + Publish Workflow

```bash
# 1. Run the release script
pnpm release

# 2. Publish to JSR
npx jsr publish --allow-dirty
```

## Branching

- **`main`** — stable, released code. All releases are cut from `main`.
- Feature branches should be named `feat/<description>` or `fix/<description>`.
- Squash-merge PRs into `main` with a conventional commit message as the title.
