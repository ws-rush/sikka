# Sikka 1.0 cross-runtime correctness matrix research

Research for [issue #4](https://github.com/ws-rush/sikka/issues/4), retrieved 2026-08-01. This records available facts and implementation alternatives; it does **not** select Sikka's product API, artifact format, or CI design. Benchmarks are deliberately excluded.

## Policy translated into a release gate

Before release, run the same correctness contract on four targets:

| Target | Policy-conforming version selection at this research date | Official installer / CI acquisition | Viable test mechanism |
| --- | --- | --- | --- |
| Node.js | **24.18.1** (latest `Krypton` LTS on 2026-08-01) | `actions/setup-node` with a full LTS patch, or `node-version: 24` when the workflow intentionally tracks LTS patches | `node --test` |
| Bun | **1.3.14** (latest stable release on 2026-08-01; Bun has no LTS line) | `oven-sh/setup-bun` with `bun-version: 1.3.14`, or `latest` to follow stable | `bun test` |
| Deno | **2.9.4** (latest stable release on 2026-08-01; Deno has no LTS line) | `denoland/setup-deno` with `deno-version: v2.9.4`, or a documented floating stable selector | `deno test` |
| Browser service worker | **Chrome for Testing Stable at workflow execution**; no browser LTS is asserted | Download the Stable Chrome for Testing artifact from its official JSON endpoint, pin the resolved version in the job output/artifact, then run headless Chrome | a browser-driver test run which registers a real service worker and reports its assertion result to the controlling test process |

The Node download index identifies `v24.18.1`, dated 2026-07-28, as LTS `Krypton`; it is therefore the concrete current value behind the stated “latest LTS” policy. [Node distribution index](https://nodejs.org/dist/index.json) Node's release project describes the LTS/current release process and schedule. [Node Release](https://github.com/nodejs/Release#release-schedule)

Bun's official release has tag `bun-v1.3.14` (published 2026-05-13); Deno's official release has tag `v2.9.4` (published 2026-07-23). Neither official release process documents an LTS channel, so “latest stable” is the applicable policy branch. [Bun v1.3.14 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14) [Deno v2.9.4 release](https://github.com/denoland/deno/releases/tag/v2.9.4)

Chrome for Testing publishes `last-known-good-versions-with-downloads.json`, including the Stable channel and platform download URLs. Resolving it in CI meets “latest stable”; recording its returned version makes a release run reproducible. The endpoint is rolling, so this report intentionally does not pretend a browser number observed on 2026-08-01 will remain current. [Chrome for Testing JSON API](https://github.com/GoogleChromeLabs/chrome-for-testing#json-api-endpoints)

## Installation and workflow facts

* `actions/setup-node` accepts `node-version`, supports a version file, and recommends specifying a Node version because the runner's preinstalled version can change. [setup-node README](https://github.com/actions/setup-node#usage)
* Bun documents `oven-sh/setup-bun@v2` for GitHub Actions, including the `bun-version` input. Bun's own install page also documents the supported direct installers. [Bun GitHub Actions guide](https://bun.com/docs/guides/runtime/cicd) [Bun installation](https://bun.com/docs/installation)
* Deno's official `setup-deno` action documents the `deno-version` input and releases/version selection. [setup-deno README](https://github.com/denoland/setup-deno)
* GitHub Actions matrices create one job per combination and expose matrix values to steps. A four-row `include` matrix can carry the target name, setup action, fixed/floating selector, and command without conflating the browser job with server runtimes. [GitHub Actions matrix documentation](https://docs.github.com/actions/using-jobs/using-a-matrix-for-your-jobs)
* Node's built-in runner is invoked with `node --test`; Bun documents `bun test`; Deno documents `deno test`. These runners need not share an assertion package: a small runtime-neutral assertion helper plus target launchers is sufficient. [Node test runner](https://nodejs.org/api/test.html) [Bun test runner](https://bun.sh/docs/cli/test) [Deno tests](https://docs.deno.com/runtime/fundamentals/testing/)

### Version-management alternatives and constraints

1. **Fixed patch per PR/release, scheduled update PR:** write `24.18.1`, `1.3.14`, and `2.9.4` in CI, then update them on a schedule. This is reproducible, but a release gate is only policy-compliant if an update process advances each version before release.
2. **Major/minor selectors for server runtimes, Stable-channel browser resolution:** use `24` for Node LTS patches and each vendor's documented floating selector (where offered) for Bun/Deno. This continuously satisfies “latest,” but a rerun can use different bits; record `node --version`, `bun --version`, `deno --version`, and the resolved Chrome version as CI artifacts.
3. **Resolve, then test a lock file:** a scheduled job queries each official release endpoint, opens a version-pin update, and release CI tests only that lock. This combines reviewable changes with a clear pre-release update gate.

The policy itself chooses the supported version *class*, not whether the repository should float values or update pins. That is a later engineering decision.

## Minimum shared correctness fixture

The smallest useful cross-runtime contract consists of one source Template, one Props object, one exact expected Rendered HTML string, and two execution modes:

```astro
---
const { name, items } = Astro.props;
---
<main><h1>{name}</h1><ul>{items.map((item) => <li>{item}</li>)}</ul></main>
```

```js
const props = { name: 'Ada & <Lin>', items: ['one', 'two'] };
const expected =
  '<main><h1>Ada &amp; &lt;Lin&gt;</h1><ul><li>one</li><li>two</li></ul></main>';
```

For Node, Bun, and Deno, the fixture's normal path renders that Template with those Props and compares byte-for-byte to `expected`. It proves the minimum meaningful Rendered-HTML parity: Template parsing, Props binding, expression/loop evaluation, static concatenation, element emission, and default escaping. A one-expression Template would not prove loop/nested-node behavior; component, slots, streaming chunks, filesystem loading, and every syntax feature should remain separate focused contracts rather than inflate this minimum gate.

The browser path must consume an artifact generated before the browser job (the **Precompiled Template**) and render the identical `props`. It asserts the same `expected` from inside a real service worker. The browser harness may use a page only to register the worker and receive a `postMessage` result; the assertion relevant to this gate is executed in the worker. The artifact must be static JavaScript/module data loaded from `'self'`, not Template source that is compiled in the worker.

This is a fixture specification, not a proposed public API. It leaves open whether the artifact is an ESM module, a JSON-like instruction format plus a fixed interpreter, or another portable representation. Each alternative must expose an importable/renderable precompiled artifact without runtime code generation.

## Strict-CSP service-worker proof

Serve the page, service-worker script, artifact, and test harness from one local origin with headers at least:

```
Content-Security-Policy: default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'
```

Use only external same-origin modules/scripts (no inline script, nonce, hash, or `'unsafe-eval'`). A strict policy must reject JavaScript string evaluation: CSP's `script-src` pre-request/in-line checks define `'unsafe-eval'` as the keyword that enables eval-like APIs, and absent that source expression such evaluation is blocked. [CSP Level 3: `script-src`](https://w3c.github.io/webappsec-csp/#directive-script-src) Service workers are only available in secure contexts; `http://localhost` is treated as potentially trustworthy for local testing, while deployment should use HTTPS. [Secure Contexts](https://w3c.github.io/webappsec-secure-contexts/) [Service Workers specification](https://w3c.github.io/ServiceWorker/)

A passing test needs all of the following observable conditions:

1. the controlling browser page successfully registers and activates the worker;
2. the worker imports/receives the precompiled artifact and renders `expected` after a message containing `props`;
3. the worker reports the exact comparison result back to the controller; and
4. the CSP header remains active for this flow (the test must not weaken it with `'unsafe-eval'`).

This is a positive execution proof, not merely static inspection. It will fail if the precompiled path relies on `eval`, `new Function`, or an inline script under the supplied policy.

## Current-repository constraint relevant to the fixture

At the researched revision, `Sikka.compile()` delegates to `compileString()`, and the sync compiler constructs its generated renderer with `new Function` (`src/compiler.ts`, `createSyncFunction`). `compileToString()` returns a function body rather than an importable precompiled artifact (`src/index.ts`). Consequently, the existing compile path cannot itself be the strict-CSP browser execution path; a later ticket must define and implement a separate precompilation artifact/runtime contract. This is an observation of current code, not an implementation recommendation.

## Browser-runner alternatives

* **Browser automation driver (most direct):** launch Chrome for Testing headlessly from CI, navigate to the local fixture origin, and fail the outer test process on the worker's posted failure. This validates browser networking, headers, worker lifecycle, and CSP together. Playwright's official test runner documents Chromium execution and web-server support, but adopting it is a dependency/tooling decision. [Playwright test runner](https://playwright.dev/docs/test-intro) [Playwright web server option](https://playwright.dev/docs/test-webserver)
* **Web Platform Tests-style harness:** use a browser harness and WPT-compatible tests. The WPT project provides the canonical upstream cross-browser test suite and documented service-worker tests, but running it for this library is substantially heavier than the one-fixture release gate. [web-platform-tests](https://web-platform-tests.org/)
* **Raw headless Chrome plus a small controller:** invoke Chrome for Testing with `--headless` and use a purpose-built page protocol. This minimizes test dependencies but makes lifecycle, retries, and failure diagnostics repository responsibilities. Chrome documents headless operation. [Chrome Headless mode](https://developer.chrome.com/docs/chromium/headless)

None of these browser options should be substituted by a Node worker emulator: the required evidence is service-worker execution under browser CSP.

## Recommended research handoff checklist

The later implementation/design ticket needs to choose, and document, all of these items:

- artifact API and serialization/module format for a Precompiled Template;
- a shared fixture location, target launchers, and a normal-render plus precompiled-render oracle;
- fixed-versus-floating runtime selection and how resolved versions are recorded;
- whether browser automation is Playwright, WPT infrastructure, or raw Chrome;
- CSP headers and local HTTPS/localhost server behavior; and
- release workflow protection so all four jobs are required before publishing.

No application source changes, product decision, or benchmark plan is contained in this research note.
