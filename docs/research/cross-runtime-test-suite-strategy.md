# Cross-runtime test-suite strategy

**Issue:** [#12](https://github.com/ws-rush/sikka/issues/12)  
**Scope:** planning only. This note evaluates test tools and defines an authoring/runner boundary; it makes no source, test, or CI change.

## Decision

**No currently documented single testing tool meets the requirement.** In particular, no evaluated tool both executes Sikka's TypeScript/property suite in Node.js, Bun, and Deno **and** proves the same behavior in a real browser service worker subject to strict CSP. Use a small portable test contract with four thin target runners instead:

| Target | Runner boundary | What it proves |
| --- | --- | --- |
| Node.js | Node adapter registered with `node:test`, launched by `node --test` | Source-render and precompiled-runtime behavior on Node |
| Bun | Bun adapter registered with `bun:test`, launched by `bun test` | The same portable cases on Bun |
| Deno | Deno adapter registered with `Deno.test`, launched by `deno test` | The same portable cases on Deno |
| Browser service worker | A real Chromium-family browser launched by Playwright; a same-origin page registers a module service worker, which executes the cases and posts its report to the controller | Precompiled-runtime behavior in an actual service worker under the supplied CSP |

The outer Playwright process is only a browser controller. The relevant assertion is evaluated in the worker, not in Node, a DOM emulator, or the page. Playwright documents its service-worker inspection support, and its test runner can manage a web server; those capabilities make it an appropriate **browser-target runner**, not a universal runner. [Playwright service workers](https://playwright.dev/docs/service-workers) [Playwright web server](https://playwright.dev/docs/test-webserver)

This gives one maintained behavioral corpus rather than one universal runner. It is the smallest boundary that does not pretend a server runtime is a browser service worker.

## Why a single tool is not available

### Native runners cover three different hosts, not the browser worker

Node documents its built-in runner and the `node --test` entry point. [Node test runner](https://nodejs.org/api/test.html) Bun documents `bun test` and its `bun:test` test API. [Bun: writing tests](https://bun.sh/docs/test/writing-tests) Deno documents `deno test` and `Deno.test`; it also publishes a Node-compatibility reference for `node:test`. [Deno testing](https://docs.deno.com/runtime/fundamentals/testing/) [Deno `node:test` reference](https://docs.deno.com/api/node/test/)

Those facts make `node:test` compatibility worth preserving as a migration aid. They do not make `node:test` a browser-service-worker runner. Even if a particular `node:test` subset executes in all three server runtimes, it provides no browser process, worker registration, CSP response headers, or worker-side report channel.

### Browser-capable candidates do not document the four-runtime execution model

* **Vitest Browser Mode** runs tests natively in a browser, but its own documentation requires a browser provider and recommends Playwright or WebdriverIO for CI; the examples configure a Vite server and Chromium. It does not document Deno as a Vitest execution target. [Vitest Browser Mode](https://vitest.dev/guide/browser/)
* **Playwright Test** can launch real browsers and start a web server, but its documented test-runner installation and configuration are Node/package-manager based. It supplies the browser half of this strategy, not Node, Bun, and Deno execution of one runner. [Playwright introduction](https://playwright.dev/docs/intro) [Playwright test runner](https://playwright.dev/docs/test-intro)
* **Web Test Runner** is a browser test runner with browser launchers and a Node-hosted CLI. It is useful for browser-only suites, but its official overview does not specify Node/Bun/Deno/browser-worker parity. [Web Test Runner overview](https://modern-web.dev/docs/test-runner/overview/)
* **Web Platform Tests** is the upstream browser conformance suite, not a documented all-four JavaScript-runtime runner for a library's TypeScript suite. Its service-worker infrastructure is heavier than the single strict-CSP proof Sikka needs. [web-platform-tests](https://web-platform-tests.org/)

Therefore selecting Vitest, Playwright, Web Test Runner, or a native runner as the single answer would leave at least one required target outside its officially documented execution model.

## Current-suite assessment

The existing suite is deliberately Node-shaped:

* Each test file imports `describe`/`it` from `node:test`; `test/assert.ts` imports `node:assert/strict`.
* `package.json` invokes `nub --test test/*.test.ts`, rather than a runtime-neutral test command.
* Tests are TypeScript and import source modules via `.js` specifiers. A browser worker must receive transformed ESM; it cannot execute TypeScript source or resolve Node built-ins directly.
* `test/property.test.ts` imports `fast-check` and calls synchronous `fc.assert(fc.property(...))` for determinism, cache identity/bypass, null-props equivalence, frontmatter equivalence, Prop reflection, and Component isolation.

The installed `fast-check` major is 4. Its own README states requirements in terms of Node and ECMAScript, and its package metadata declares a Node engine. Its ESM export may work in additional environments after resolution/bundling, but that is not an official promise of support for Deno or a browser service worker. It must consequently not be the basis for a claimed four-target property-test guarantee. [fast-check README: requirements](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/README.md#minimal-requirements) [fast-check package metadata](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/package.json)

There is a second, intentional product boundary. At this revision Sikka's synchronous compiler constructs a renderer with `new Function` (`src/compiler.ts`), and `Sikka.compileToString()` returns a function body (`src/index.ts`). The current dynamic compilation path is therefore not a strict-CSP service-worker path. The browser test must consume a future **Precompiled Template**, as identified by the cross-runtime matrix research, rather than execute the current source-compilation tests in a worker. [Cross-runtime correctness matrix](./sikka-1-runtime-matrix.md#current-repository-constraint-relevant-to-the-fixture)

This is not a coverage loophole: source compilation is a build-time/server-runtime capability, while the browser's supported runtime contract is rendering a precompiled artifact. The same Template/Props/Rendered HTML behavior must be tested in both paths; the dynamic compiler's implementation details cannot be meaningfully executed under the required CSP.

## Recommended portable authoring layer

Add this only when the later implementation ticket acts; the following names describe the boundary, not a committed file layout.

### 1. Portable tests own behavior, not a runner import

Move Sikka behavioral cases into modules exporting a registration function such as:

```ts
export function registerSikkaCases(api: PortableTestApi): void {
  api.describe('escaping', () => {
    api.it('renders an Escaped value', () => {
      api.expect(api.target.render(template, props)).toEqual(expectedHtml);
    });
  });
}
```

`PortableTestApi` contains only:

1. `describe(name, define)` and `it(name, body)` for synchronous registration and async bodies;
2. the current small matcher surface (`toBe`, structural `toEqual`, `toContain`, numeric comparison, instance/error and rejection checks, and negations); and
3. `property(name, generator, predicate, { seed, runs })`; and
4. `target`, an injected adapter that maps a fixture and Props to the target's Rendered HTML.

The assertion implementation must use only ECMAScript/Web Platform values, not `node:assert`; preserve today's error-match behavior. `describe` is presentation/grouping only, so the Deno and worker adapters may flatten names while retaining a stable fully-qualified test id. No snapshots, filesystem, process globals, fake timers, mocking API, DOM abstraction, or test-framework plug-in belongs in this layer. Sikka has no need for them to assert Render semantics.

### 2. Portable property checks replace the release dependency on fast-check

Implement the `property` primitive as a deterministic seeded loop with a deliberately small PRNG and generators needed by the suite (`string`, bounded array/object values, map/filter, and predicate filtering). Its failure must report the seed, run number, and generated input. A failure can then be replayed byte-for-byte in every target.

For the present properties, this is small: a safe-template-text generator and an alphanumeric Props generator reproduce every current `fast-check` domain. Keep a Node-only `fast-check` exploratory/fuzz command if desired, because its shrinking is valuable for discovering a counterexample, but make a reported seed/input a portable regression case before treating it as cross-runtime release evidence. Do not claim fast-check's random execution itself is four-runtime evidence unless its maintainers publish that support.

This preserves equivalent property coverage: each target receives the same seed, run count, generated inputs, predicate, and failure oracle. It is stronger than accepting four unrelated random samples.

### 3. Cases are data-driven across source and precompiled paths

Put shared Template source, Props, expected Rendered HTML, and expected streaming chunks in a target-neutral fixture/case module. Each behavior gets a stable id. The source-capable target exposes `renderSource`, `streamSource`, and injected `readFile`; the browser target exposes `renderPrecompiled` and messages the same Props to its worker.

A case that asserts syntax semantics must have both forms:

* Node/Bun/Deno: render the Template source and compare exact Rendered HTML (and, where applicable, streaming output/chunks).
* Browser worker: render the corresponding precompiled artifact with the same Props and compare the same exact Rendered HTML in the worker.

This covers Template parsing/compilation on the three source-capable runtimes and precompiled rendering on all four targets. Cases that are intrinsically build-time-only (`compileToString`, cache identity, custom `readFile`, dynamic compilation diagnostics) remain source-compiler conformance tests, explicitly marked as such; they are not misrepresented as browser service-worker behavior. The browser's artifact/runtime tests are the equivalent coverage for its supported contract.

Compile the portable test modules and production modules to browser-loadable ESM before the worker run. The worker must import only static same-origin modules/artifacts; it must not transform TypeScript, import `node:` modules, or evaluate generated source at runtime.

## Per-target runner responsibilities

| Runner | Adapter responsibility | Must not do |
| --- | --- | --- |
| Node | Bridge `PortableTestApi` to `node:test`; load the compiled test corpus or the repository's approved TypeScript loader. | Supply browser globals or be used as CSP evidence. |
| Bun | Bridge to `bun:test`; run exactly the shared case manifest and seed list. | Rely on undocumented Node-compatibility behavior as the portability contract. |
| Deno | Bridge to `Deno.test`; use Deno's documented ESM/TypeScript handling or compiled ESM and the same manifest. | Import `node:assert` or make Node resolution part of the cases. |
| Browser service worker | A Playwright-controlled page verifies registration/activation, sends the worker a case manifest and Props, and fails on the worker's structured failure report. The worker imports the precompiled artifacts, executes the portable collector, and reports completed ids plus failures via `postMessage`. | Run the assertions in the page/controller, use JSDOM/a worker emulator, or fall back to source compilation. |

Every runner must emit the stable case ids, count, seed, and target version. CI should reject a run whose completed ids differ from the shared manifest. That is the enforcement mechanism for “equivalent coverage,” rather than assuming identical-looking commands have run identical tests.

## Strict-CSP browser acceptance proof

Serve the controller page, module worker script, test modules, and Precompiled Template artifacts from one local secure origin. Service workers are exposed through `navigator.serviceWorker` in secure contexts, and worker creation is governed by CSP's `worker-src`; CSP's `script-src` controls script loading and its `unsafe-eval` keyword covers eval-like APIs. [Service Workers specification](https://w3c.github.io/ServiceWorker/) [CSP Level 3: `worker-src`](https://w3c.github.io/webappsec-csp/#directive-worker-src) [CSP Level 3: `script-src`](https://w3c.github.io/webappsec-csp/#directive-script-src)

Apply at least this header to the fixture responses:

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'
```

Use no inline script, nonce, hash, or `'unsafe-eval'`. A passing browser target must demonstrate all of the following:

1. the page registers and activates the real module service worker;
2. the worker imports a same-origin Precompiled Template and receives the fixture Props;
3. the worker performs the exact Rendered HTML/property assertions and posts its result to the page; and
4. the browser controller fails the test when registration, activation, an assertion, the manifest count, or the worker report fails.

This proves strict-CSP service-worker behavior. A Node `worker_threads` test, a JavaScript DOM implementation, or a page-only assertion does not.

## Alternatives rejected

| Alternative | Rejection reason |
| --- | --- |
| Keep the current `node:test`/`node:assert` files and invoke them everywhere | They import Node-only modules; no browser worker runner results. Bun/Deno compatibility, where available, does not create a browser CSP proof. |
| Make Vitest the one framework | Browser Mode is real-browser capable, but its documented model is Vite plus a browser provider, not execution by Deno and all required runtime hosts. [Vitest Browser Mode](https://vitest.dev/guide/browser/) |
| Make Playwright Test the entire suite | It is the recommended browser controller, but not a documented Node/Bun/Deno test-execution abstraction. |
| Make Web Test Runner or WPT the entire suite | They solve browser execution, not the three server runtime runners; WPT also imposes substantially more infrastructure than the required library contract. |
| Continue treating `fast-check` as portable by observation | Its official requirements declare Node, not the required Deno/browser-service-worker support. [fast-check README](https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/README.md#minimal-requirements) |
| Execute `Sikka.compile()` in the strict-CSP worker | The current `new Function` implementation conflicts with the required no-`'unsafe-eval'` proof. The browser must execute a Precompiled Template. |

## Handoff to issue #9

The CI-planning ticket should choose the exact version selectors and CI commands, then require these four deliverables:

1. a compiled portable-corpus artifact plus its stable manifest and seed policy;
2. three server adapters and one Playwright browser/service-worker adapter;
3. a source fixture and matching Precompiled Template with identical Props/Rendered HTML; and
4. recorded target/browser versions and worker-side result artifacts.

That plan should retain focused source-compiler tests for server runtimes and require the browser job for the precompiled strict-CSP contract. It must not replace the browser job with a Node emulator or weaken CSP to make dynamic compilation pass.
