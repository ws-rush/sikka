import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import { Bench } from 'tinybench';
import { Sikka } from 'sikka';
import { compile as precompile, emitModule } from 'sikka/precompile';

const rootDirectory = fileURLToPath(new URL('..', import.meta.url));
const runtimeModule = import.meta.resolve('sikka/runtime');

const DEFAULT_TIME = 1_000;
const DEFAULT_WARMUP_TIME = 250;
const benchmarkTime = parseDuration('SIKKA_BENCH_TIME', DEFAULT_TIME);
const warmupTime = parseDuration('SIKKA_BENCH_WARMUP_TIME', DEFAULT_WARMUP_TIME);

const escapeData = { name: '<Template & Friends>' };
const conditionalData = {
  account: {
    isNegative: true,
    isOpen: true,
    label: '-$12.50',
  },
};
const nestedLoopData = {
  items: Array.from({ length: 25 }, (_, id) => ({
    id,
    name: `Item ${id}`,
    tags: [`tag-${id}-a`, `tag-${id}-b`, `tag-${id}-c`],
  })),
};

const scenarios = [
  {
    name: 'Static HTML',
    data: {},
    expected: '<main><h1>Template benchmark</h1><p>Static HTML</p></main>',
    templates: {
      sikka: '<main><h1>Template benchmark</h1><p>Static HTML</p></main>',
      eta: '<main><h1>Template benchmark</h1><p>Static HTML</p></main>',
    },
  },
  {
    name: 'Escaped interpolation',
    data: escapeData,
    expected: '<p>Hello, &lt;Template &amp; Friends&gt;!</p>',
    templates: {
      sikka: '<p>Hello, {Astro.props.name}!</p>',
      eta: '<p>Hello, <%= it.name %>!</p>',
    },
  },
  {
    name: 'Conditional and attribute',
    data: conditionalData,
    expected: '<div class="negative">-$12.50</div>',
    templates: {
      sikka:
        "<div class={Astro.props.account.isNegative ? 'negative' : 'positive'}>{Astro.props.account.isOpen ? Astro.props.account.label : 'Closed'}</div>",
      eta: "<div class=\"<%= it.account.isNegative ? 'negative' : 'positive' %>\"><%= it.account.isOpen ? it.account.label : 'Closed' %></div>",
    },
  },
  {
    name: 'Nested loops',
    data: nestedLoopData,
    expected: renderExpectedNestedLoops(nestedLoopData.items),
    templates: {
      sikka:
        '<ul>{Astro.props.items.map((item) => <li data-id={item.id}><span>{item.name}</span><ul>{item.tags.map((tag) => <li>{tag}</li>)}</ul></li>)}</ul>',
      eta: '<ul><% it.items.forEach((item) => { %><li data-id="<%= item.id %>"><span><%= item.name %></span><ul><% item.tags.forEach((tag) => { %><li><%= tag %></li><% }) %></ul></li><% }) %></ul>',
    },
  },
];

const engines = [
  {
    id: 'sikka',
    name: 'Sikka',
    async compile(template, scenarioName) {
      const [artifact] = precompile('entry', {
        resolver: () => ({ id: `${scenarioName}.astro`, source: template }),
      });
      const module = await import(
        `data:text/javascript,${encodeURIComponent(
          emitModule(artifact, { runtimeSpecifier: runtimeModule })
        )}`
      );
      const sikka = new Sikka({ mode: 'precompiled', resolver: () => module });
      return (data) => sikka.render('entry', data);
    },
  },
  {
    id: 'eta',
    name: 'Eta',
    compile(template) {
      const eta = new Eta();
      const compiled = eta.compile(template);
      return (data) => eta.render(compiled, data);
    },
  },
];

printRunContext();
for (const scenario of scenarios) {
  const renderers = await setupRenderers(scenario);
  await validateRenderers(scenario, renderers);
  console.log(`Validated exact expected HTML: ${scenario.name}`);
  printScenarioResults(scenario.name, await benchmarkScenario(scenario, renderers));
}

function printRunContext() {
  const cpu = os.cpus()[0];
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  }).trim();
  const lockDigest = createHash('sha256')
    .update(fs.readFileSync(path.join(rootDirectory, 'nub.lock')))
    .digest('hex');

  console.log('Two-engine precompiled-render benchmark');
  console.log(`Run date: ${new Date().toISOString()}`);
  console.log(`Benchmark revision: ${revision}${dirty ? ' (dirty working tree)' : ''}`);
  console.log(`Runtime: Node ${process.version}`);
  console.log(
    `Machine/platform: ${cpu?.model ?? 'unknown CPU'} (${os.cpus().length} CPUs) · ${os.type()} ${os.release()} · ${process.platform}/${process.arch}`
  );
  console.log(`Dependency lock: nub.lock sha256:${lockDigest}`);
  console.log(`Scenarios: ${scenarios.map((scenario) => scenario.name).join(', ')}`);
  console.log(
    `Scope: local manual comparison of exact scenario HTML; timed work is public precompiled rendering only (${benchmarkTime}ms per engine/order, ${warmupTime}ms warmup). Compilation, generated-module setup, and validation are excluded for both engines. Each scenario runs in both engine orders; reported throughput is the mean. This is not a runtime compatibility or performance leadership claim.\n`
  );
}

function parseDuration(variable, defaultValue) {
  const value = process.env[variable];
  if (value === undefined) return defaultValue;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${variable} must be a positive number of milliseconds; received ${value}`);
  }

  return parsed;
}

async function setupRenderers(scenario) {
  return Promise.all(
    engines.map(async (engine) => {
      const template = scenario.templates[engine.id];
      const render = await engine.compile(
        template,
        scenario.name.replaceAll(' ', '-').toLowerCase()
      );
      return { name: engine.name, render };
    })
  );
}

async function validateRenderers(scenario, renderers) {
  for (const renderer of renderers) {
    const output = await renderer.render(scenario.data);
    if (output !== scenario.expected) {
      throw new Error(
        `${renderer.name} rendered different HTML for ${scenario.name}.\nExpected: ${scenario.expected}\nReceived: ${output}`
      );
    }
  }
}

async function benchmarkScenario(scenario, renderers) {
  const resultsByEngine = new Map(renderers.map(({ name }) => [name, []]));

  for (const order of [renderers, renderers.toReversed()]) {
    globalThis.gc?.();
    for (const result of await benchmarkOrder(scenario, order)) {
      resultsByEngine.get(result.name).push(result);
    }
  }

  return [...resultsByEngine]
    .map(([name, [first, second]]) => {
      const operationsPerSecond = (first.operationsPerSecond + second.operationsPerSecond) / 2;
      return {
        name,
        operationsPerSecond,
        relativeMarginOfError: Math.max(first.relativeMarginOfError, second.relativeMarginOfError),
        orderSpread:
          (Math.abs(first.operationsPerSecond - second.operationsPerSecond) / operationsPerSecond) *
          100,
      };
    })
    .toSorted((left, right) => right.operationsPerSecond - left.operationsPerSecond);
}

async function benchmarkOrder(scenario, renderers) {
  const bench = new Bench({
    throws: true,
    time: benchmarkTime,
    warmup: true,
    warmupTime,
  });

  for (const renderer of renderers) {
    bench.add(renderer.name, () => renderer.render(scenario.data));
  }

  await bench.run();

  return bench.tasks.map((task) => {
    if (task.result?.state !== 'completed') {
      throw new Error(`${task.name} did not complete: ${task.result?.state ?? 'unknown state'}`);
    }

    return {
      name: task.name,
      operationsPerSecond: task.result.throughput.mean,
      relativeMarginOfError: task.result.throughput.rme,
    };
  });
}

function printScenarioResults(name, results) {
  const fastest = results[0].operationsPerSecond;
  console.log(name);
  console.table(
    results.map((result, index) => ({
      Rank: index + 1,
      Engine: result.name,
      'ops/sec': Math.round(result.operationsPerSecond).toLocaleString(),
      'vs. fastest': `${((result.operationsPerSecond / fastest) * 100).toFixed(1)}%`,
      'order spread': `${result.orderSpread.toFixed(1)}%`,
      'max RME': `±${result.relativeMarginOfError.toFixed(2)}%`,
    }))
  );
}

function renderExpectedNestedLoops(items) {
  return `<ul>${items
    .map(
      (item) =>
        `<li data-id="${item.id}"><span>${item.name}</span><ul>${item.tags
          .map((tag) => `<li>${tag}</li>`)
          .join('')}</ul></li>`
    )
    .join('')}</ul>`;
}
