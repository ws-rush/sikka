# Sikka 1.0 readiness gaps

**Assessment date:** 2026-08-01  
**Scope:** the 1.0 destination in [issue #1](https://github.com/ws-rush/sikka/issues/1), assessed at `19bc591`.

## Conclusion

Sikka has a useful, Node-exercised implementation, including a parser/compiler, caching, components, slots, synchronous and streaming paths, and default escaping. It is **not release-ready for the stated 1.0 destination**. The release-blocking evidence is the absence of a defined and testable stable/precompiled public artifact, no cross-runtime CI or demonstrated service-worker operation, npm metadata and documentation aimed at JSR rather than the required `sikka` package, no CI/release provenance automation, and no runnable authoritative benchmark. The README also says the API is subject to significant change.

This is a gap assessment, not a change proposal. “No evidence” means no tracked implementation, test, workflow, or documentation was found in this revision; it is not a claim that a behavior is impossible.

## Confirmed-ready foundations

| Property | Evidence | Assessment |
| --- | --- | --- |
| Core has no production dependency declaration and accepts injected synchronous file reads. | [`package.json`](../../package.json) has no `dependencies`; [`src/types.ts`](../../src/types.ts) defines `readFile`; [`src/index.ts`](../../src/index.ts) consumes it. | A sound runtime-agnostic core direction, but not proof of all-runtime support. |
| Template syntax has substantial executable coverage. | The `test/syntax-01` through `test/syntax-07` suites exercise frontmatter, expressions, elements, directives, slots, and errors. | Strong Node-only regression base. |
| Interpolations escape HTML by default; the streaming path has escaping coverage. | [`src/escape.ts`](../../src/escape.ts) escapes `&`, `<`, `>`, `"`, and `'`; [`src/compiler.ts`](../../src/compiler.ts) selects escaping unless `autoEscape === false`; [`test/api.test.ts`](../../test/api.test.ts) tests streamed escaping. | Meets the baseline Props-escaped-by-default direction, subject to the explicit raw-output exceptions below. |
| Explicit raw-output features exist. | [`src/escape.ts`](../../src/escape.ts) defines `RawHtml`; [`src/compiler.ts`](../../src/compiler.ts) emits `set:html` without escaping; [`test/syntax-04-directives.test.ts`](../../test/syntax-04-directives.test.ts) confirms verbatim `set:html`. | The intended trusted-author responsibility exists semantically. The public packaging/API surface and security documentation do not yet make that boundary release-ready. |
| Sync and stream share compilation machinery and have parity examples. | [`src/compiler.ts`](../../src/compiler.ts) exports sync and streaming compilers using shared option/component resolution and node emission; [`test/api.test.ts`](../../test/api.test.ts) compares a complex stream with `renderString`. | Useful local parity evidence only. |

## Release-blocking gaps, grouped by dependency

### 1. Contract decisions and public surface (blocks precompilation, compatibility, runtime certification)

1. **No stable 1.0 API boundary is declared.** The README’s opening warning says APIs and internal behavior are subject to significant changes ([`README.md`](../../README.md)). `package.json` is version `0.1.0` and provides no stability, deprecation, compatibility, or supported-runtime statement. The actual root export is only `Sikka` ([`src/index.ts`](../../src/index.ts)); public types and `RawHtml` are not re-exported even though `RawHtml` is the documented trusted-value abstraction in source. The README API list also omits implemented `registerComponent` ([`src/index.ts`](../../src/index.ts)).

2. **The advertised `resolvePath` contract is not implemented.** README and `SikkaOptions` describe a sync/async custom resolver ([`README.md`](../../README.md), [`src/types.ts`](../../src/types.ts)), but component resolution calls the compiler’s private synchronous string normalizer rather than `options.resolvePath` ([`src/compiler.ts`](../../src/compiler.ts)). The API therefore promises behavior with no matching implementation or focused test.

3. **The syntax document is an unversioned example inventory, not an audited contract.** [`README.astro-syntax.md`](../../README.astro-syntax.md) presents many examples labelled “fails,” “error,” “not recommended,” and behavior claims without a support-status matrix, normative output/error rules, compatibility policy, or an explicit association to a release. It asserts TypeScript-like frontmatter examples, while the executable test records that `new Function` cannot execute TypeScript `interface` syntax ([`test/syntax-01-file-structure.test.ts`](../../test/syntax-01-file-structure.test.ts)). Its every-example scope has not been demonstrated by a corresponding example-to-test audit. This conflicts with the parent requirement to preserve behavior while making this file the audited Syntax Contract.

4. **Precompilation is neither a stable API nor a portable artifact.** `compileToString()` returns an internal JavaScript *function body* ([`src/index.ts`](../../src/index.ts)), not a documented artifact with versioning, imports/exports, helper linkage, component handling, or build-tool contract. `compile()` immediately turns generated text into a function with `new Function` ([`src/compiler.ts`](../../src/compiler.ts)). No tracked public precompile API, artifact fixture, or build-tool integration exists. That blocks the agreed strict-CSP portable-precompilation strategy.

### 2. Runtime and security evidence (depends on a stable contract/artifact)

1. **Service-worker strict-CSP compatibility is contradicted by the runtime compiler.** Both ordinary rendering and streaming dynamically construct executable code with `new Function` ([`src/compiler.ts`](../../src/compiler.ts)); there is no precompiled execution path. CSP Level 3 specifies that `unsafe-eval` controls string-to-code APIs including `Function` ([W3C CSP3 §6.7.3.1](https://www.w3.org/TR/CSP3/#source-list-unsafe-eval)). Thus the current normal path cannot establish the required portable strict-CSP strategy.

2. **There is no cross-runtime implementation proof or correctness matrix.** There is no tracked `.github/workflows/` directory; GitHub reports zero Actions workflows for the repository ([GitHub Actions workflow API](https://api.github.com/repos/ws-rush/sikka/actions/workflows)). Tests import `node:test` ([`test/*.test.ts`](../../test)) and the package declares Node `>=18.19.0` ([`package.json`](../../package.json)). No Deno, Bun, browser service-worker harness, lockfile/install instructions, or rendered-HTML comparison across all four targets is tracked. This does not meet the parent’s Node/Bun/Deno/service-worker parity and latest-LTS/latest-stable policy. GitHub’s documented matrix facility is the standard mechanism for enumerating job variants, but none is present ([GitHub Docs: matrix strategies](https://docs.github.com/actions/using-jobs/using-a-matrix-for-your-jobs)).

3. **Security posture is incomplete for a production package.** The source correctly treats templates as executable code: frontmatter and expressions are inserted into `new Function` ([`src/compiler.ts`](../../src/compiler.ts)). The parent excludes visitor-submitted templates, but README does not state that threat boundary, does not document `set:html`/`autoEscape: false` risks in its security section, and does not expose/document a supported public `RawHtml` import. [`README.astro-syntax.md`](../../README.astro-syntax.md) does show an unsafe `set:html` example, but it is not a security policy. No tracked `SECURITY.md`, vulnerability-reporting route, or security release procedure exists.

### 3. Distribution, documentation, and release controls (depends on the stable public contract)

1. **Packaging is incompatible with npm-only `sikka`.** [`package.json`](../../package.json) names the package `sikka`, but README installation/import instructions use `@rush/sikka` and JSR commands, including a duplicated `nubx jsr add` command ([`README.md`](../../README.md)). [`jsr.json`](../../jsr.json), [`CONTRIBUTING.md`](../../CONTRIBUTING.md), and [`scripts/release.cjs`](../../scripts/release.cjs) are explicitly JSR-oriented. npm registry queries for both `sikka` and `@rush/sikka` returned 404 during this assessment. No npm publish configuration, npm release documentation, provenance setting, or published-package smoke test is tracked. npm’s publisher documentation is the authoritative release interface ([npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish)).

2. **Release process is interactive, local, and does not run the documented full gate.** [`scripts/release.cjs`](../../scripts/release.cjs) builds and tests, then commits/tags/pushes from a local prompt; it does not run format, lint, fallow, typecheck, coverage, runtime matrix, package install smoke test, benchmark gate, or npm publication. [`CONTRIBUTING.md`](../../CONTRIBUTING.md) documents JSR publication separately. With no CI workflows or release artifacts (repository API reports zero workflows and zero releases), the project has no automated, auditable release gate or provenance evidence.

3. **README needs a full release-facing audit.** In addition to incorrect registry instructions, it calls the project “vibecoded” and “under heavy development,” states Node/Bun/Deno/browser support without a version policy or qualification, calls a Node-only test runner zero-runtime, and documents `resolvePath` despite the implementation discrepancy. This prevents README from serving as a dependable 1.0 user contract.

4. **The isolated validation run is not reproducible as-is.** `nub run typecheck` completed, but `nub run test` failed: 398 passed and 2 failed because [`test/syntax-06-astro-global.test.ts`](../../test/syntax-06-astro-global.test.ts) dynamically imports `zod`, while `zod` was unavailable in this worktree. The test is declared as a dev dependency in [`package.json`](../../package.json), so this is an install/reproducibility signal rather than a renderer verdict. Because the command chain stopped at test failure, build and benchmark were not run. This finding should be rechecked from a clean documented install before treating it as an application defect.

### 4. Benchmark leadership (depends on an authoritative protocol and a runnable package)

1. **The tracked benchmark cannot be reproduced.** [`bench/index.js`](../../bench/index.js) imports a missing `../benchmark/package.json` and expects dependencies installed by `npm ci --prefix benchmark`; no tracked `benchmark/` directory or manifest exists. Consequently the README benchmark command cannot run from this revision.

2. **It is a local comparison, not the required official Node benchmark.** The benchmark defines four in-repo micro-workloads and an ad-hoc geometric-mean ranking against pinned-at-install-time competing engines ([`bench/index.js`](../../bench/index.js)); README says results are machine/runtime specific ([`README.md`](../../README.md)). There is no identified official benchmark, competitor-version policy, Node-LTS version, result baseline, variance threshold, CI run, or evidence that Sikka is #1 overall. The parent explicitly leaves this protocol unspecified, so benchmark leadership cannot yet be measured or claimed.

## Dependency order for the Wayfinder roadmap

1. **Resolve the stable API and audited Syntax Contract first:** freeze supported entry points and raw-output/security boundaries; reconcile documented options with implementation; classify every syntax-document behavior without removing existing behavior.
2. **Specify the portable precompiled artifact and supported integration contract:** this is required before strict-CSP/service-worker compatibility can be tested honestly.
3. **Certify runtime semantics:** establish the four-target version policy, test harnesses, rendered-HTML parity fixtures, and CI matrix against the frozen contract/artifact.
4. **Make distribution/release repeatable:** align package name, npm-only user docs, release checks, security reporting, package smoke tests, provenance, and automation with the certified surface.
5. **Define then execute the official Node benchmark protocol:** only after output semantics and the Node-LTS target are stable can #1 overall be a release gate.

## Research method and source limits

Repository observations link to the exact tracked files at the assessed commit. External claims use first-party project/repository APIs, standards, or vendor documentation: the parent specification ([issue #1](https://github.com/ws-rush/sikka/issues/1)), [GitHub Actions API](https://api.github.com/repos/ws-rush/sikka/actions/workflows), [W3C CSP3](https://www.w3.org/TR/CSP3/), [GitHub Actions matrix documentation](https://docs.github.com/actions/using-jobs/using-a-matrix-for-your-jobs), and [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish). The assessment does not claim current runtime behavior that was not run on that runtime.
