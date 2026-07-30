import { Bench } from 'tinybench';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Sikka } from '../dist/esm/index.js';

const requireBenchmarkDependency = createRequire(
  new URL('../benchmark/package.json', import.meta.url)
);
const ejs = requireBenchmarkDependency('ejs');
const Handlebars = requireBenchmarkDependency('handlebars');
const dust = requireBenchmarkDependency('dustjs-linkedin');
const igoDust = requireBenchmarkDependency('igo-dust');
const { Liquid } = requireBenchmarkDependency('liquidjs');
const pug = requireBenchmarkDependency('pug');
const { Eta } = await import(requireBenchmarkDependency.resolve('eta'));

const DEFAULT_TIME = 1_000;
const DEFAULT_WARMUP_TIME = 250;
const benchmarkTime = parseDuration('SIKKA_BENCH_TIME', DEFAULT_TIME);
const warmupTime = parseDuration('SIKKA_BENCH_WARMUP_TIME', DEFAULT_WARMUP_TIME);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sikka-bench-'));

const escapeData = { name: '<Sikka & Friends>' };
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
    expected: '<main><h1>Sikka benchmark</h1><p>Static HTML</p></main>',
    templates: {
      sikka: '<main><h1>Sikka benchmark</h1><p>Static HTML</p></main>',
      ejs: '<main><h1>Sikka benchmark</h1><p>Static HTML</p></main>',
      eta: '<main><h1>Sikka benchmark</h1><p>Static HTML</p></main>',
      handlebars: '<main><h1>Sikka benchmark</h1><p>Static HTML</p></main>',
      liquid: '<main><h1>Sikka benchmark</h1><p>Static HTML</p></main>',
      pug: 'main\n  h1 Sikka benchmark\n  p Static HTML',
      dust: '<main><h1>Sikka benchmark</h1><p>Static HTML</p></main>',
    },
  },
  {
    name: 'Escaped interpolation',
    data: escapeData,
    expected: '<p>Hello, &lt;Sikka &amp; Friends&gt;!</p>',
    templates: {
      sikka: '<p>Hello, {Astro.props.name}!</p>',
      ejs: '<p>Hello, <%= name %>!</p>',
      eta: '<p>Hello, <%= it.name %>!</p>',
      handlebars: '<p>Hello, {{name}}!</p>',
      liquid: '<p>Hello, {{ name | escape }}!</p>',
      pug: 'p Hello, #{name}!',
      dust: '<p>Hello, {name}!</p>',
    },
  },
  {
    name: 'Conditional and attribute',
    data: conditionalData,
    expected: '<div class="negative">-$12.50</div>',
    templates: {
      sikka:
        "<div class={Astro.props.account.isNegative ? 'negative' : 'positive'}>{Astro.props.account.isOpen ? Astro.props.account.label : 'Closed'}</div>",
      ejs: "<div class=\"<%= account.isNegative ? 'negative' : 'positive' %>\"><%= account.isOpen ? account.label : 'Closed' %></div>",
      eta: "<div class=\"<%= it.account.isNegative ? 'negative' : 'positive' %>\"><%= it.account.isOpen ? it.account.label : 'Closed' %></div>",
      handlebars:
        '<div class="{{#if account.isNegative}}negative{{else}}positive{{/if}}">{{#if account.isOpen}}{{account.label}}{{else}}Closed{{/if}}</div>',
      liquid:
        '<div class="{% if account.isNegative %}negative{% else %}positive{% endif %}">{% if account.isOpen %}{{ account.label }}{% else %}Closed{% endif %}</div>',
      pug: "div(class=account.isNegative ? 'negative' : 'positive')= account.isOpen ? account.label : 'Closed'",
      dust: '<div class="{?account.isNegative}negative{:else}positive{/account.isNegative}">{?account.isOpen}{account.label}{:else}Closed{/account.isOpen}</div>',
    },
  },
  {
    name: 'Nested loops',
    data: nestedLoopData,
    expected: renderExpectedNestedLoops(nestedLoopData.items),
    templates: {
      sikka:
        '<ul>{Astro.props.items.map((item) => <li data-id={item.id}><span>{item.name}</span><ul>{item.tags.map((tag) => <li>{tag}</li>)}</ul></li>)}</ul>',
      ejs: '<ul><% items.forEach((item) => { %><li data-id="<%= item.id %>"><span><%= item.name %></span><ul><% item.tags.forEach((tag) => { %><li><%= tag %></li><% }) %></ul></li><% }) %></ul>',
      eta: '<ul><% it.items.forEach((item) => { %><li data-id="<%= item.id %>"><span><%= item.name %></span><ul><% item.tags.forEach((tag) => { %><li><%= tag %></li><% }) %></ul></li><% }) %></ul>',
      handlebars:
        '<ul>{{#each items}}<li data-id="{{id}}"><span>{{name}}</span><ul>{{#each tags}}<li>{{this}}</li>{{/each}}</ul></li>{{/each}}</ul>',
      liquid:
        '<ul>{% for item in items %}<li data-id="{{ item.id }}"><span>{{ item.name }}</span><ul>{% for tag in item.tags %}<li>{{ tag }}</li>{% endfor %}</ul></li>{% endfor %}</ul>',
      pug: 'ul\n  each item in items\n    li(data-id=item.id)\n      span= item.name\n      ul\n        each tag in item.tags\n          li= tag',
      dust: '<ul>{#items}<li data-id="{.id}"><span>{.name}</span><ul>{#.tags}<li>{.}</li>{/.tags}</ul></li>{/items}</ul>',
    },
  },
];

const engines = [
  {
    id: 'sikka',
    name: 'Sikka',
    compile(template) {
      const sikka = new Sikka({ cache: true });
      const compiled = sikka.compile(template);
      return (data) => compiled.renderSync(data, {});
    },
  },
  {
    id: 'ejs',
    name: 'EJS',
    compile: (template) => ejs.compile(template),
  },
  {
    id: 'eta',
    name: 'Eta',
    compile(template) {
      const eta = new Eta();
      const compiled = eta.compile(template);
      return (data) => compiled.call(eta, data, { async: false });
    },
  },
  {
    id: 'handlebars',
    name: 'Handlebars',
    compile: (template) => Handlebars.compile(template),
  },
  {
    id: 'liquid',
    name: 'LiquidJS',
    compile(template) {
      const liquid = new Liquid();
      const parsed = liquid.parse(template);
      return (data) => liquid.renderSync(parsed, data);
    },
  },
  {
    id: 'pug',
    name: 'Pug',
    compile: (template) => pug.compile(template),
  },
  {
    id: 'dust',
    name: 'Dust.js',
    compile(template, scenarioName) {
      const name = `sikka-bench-${scenarioName}`;
      dust.loadSource(dust.compile(template, name));
      return (data) => renderDust(name, data);
    },
  },
  {
    id: 'igoDust',
    name: 'igo-dust',
    async compile(template, scenarioName) {
      const templatePath = path.join(temporaryDirectory, `${scenarioName}.dust`);
      fs.writeFileSync(templatePath, template);
      await igoDust.compileFile(templatePath);
      return (data) => igoDust.renderFile(templatePath, data);
    },
  },
];

try {
  console.log('Sikka template-engine benchmark');
  console.log(
    `Node ${process.version} · ${os.cpus()[0].model} · ${process.platform}/${process.arch}`
  );
  console.log(
    `Precompiled render only · ${benchmarkTime}ms per engine · ${warmupTime}ms warmup per engine\n`
  );

  const scores = new Map(engines.map((engine) => [engine.name, []]));

  for (const scenario of scenarios) {
    globalThis.gc?.();
    const renderers = await compileRenderers(scenario);
    validateRenderers(scenario, renderers);
    const results = await benchmarkScenario(scenario, renderers);
    printScenarioResults(scenario.name, results);

    const fastest = results[0].operationsPerSecond;
    for (const result of results) {
      scores.get(result.name).push(result.operationsPerSecond / fastest);
    }
  }

  printOverallRanking(scores);
} finally {
  fs.rmSync(temporaryDirectory, { force: true, recursive: true });
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

async function compileRenderers(scenario) {
  return Promise.all(
    engines.map(async (engine) => {
      const template = scenario.templates[engine.id === 'igoDust' ? 'dust' : engine.id];
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

  return bench.tasks
    .map((task) => {
      if (task.result?.state !== 'completed') {
        throw new Error(`${task.name} did not complete: ${task.result?.state ?? 'unknown state'}`);
      }

      return {
        name: task.name,
        operationsPerSecond: task.result.throughput.mean,
        relativeMarginOfError: task.result.throughput.rme,
      };
    })
    .toSorted((left, right) => right.operationsPerSecond - left.operationsPerSecond);
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
      RME: `±${result.relativeMarginOfError.toFixed(2)}%`,
    }))
  );
}

function printOverallRanking(scores) {
  const results = [...scores]
    .map(([name, caseScores]) => ({
      name,
      score: geometricMean(caseScores),
    }))
    .toSorted((left, right) => right.score - left.score);

  console.log('Overall ranking (geometric mean of each case relative to its fastest engine)');
  console.table(
    results.map((result, index) => ({
      Rank: index + 1,
      Engine: result.name,
      'Normalized score': `${(result.score * 100).toFixed(1)}%`,
    }))
  );

  const sikkaRank = results.findIndex((result) => result.name === 'Sikka') + 1;
  console.log(`Sikka rank: #${sikkaRank} of ${results.length}`);
}

function geometricMean(values) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function renderDust(name, data) {
  let error;
  let output;
  dust.render(name, data, (renderError, rendered) => {
    error = renderError;
    output = rendered;
  });

  if (error) throw error;
  if (output === undefined) throw new Error(`Dust.js rendered ${name} asynchronously`);
  return output;
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
