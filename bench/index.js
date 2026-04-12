import { Bench } from 'tinybench';
import { Engine } from '../dist/esm/index.js';
import fs from 'node:fs';
import path from 'node:path';

// Initialize engine with basic config
const engine = new Engine({
  cache: true,
  readFile: (p) => fs.promises.readFile(p, 'utf-8'),
  readFileSync: (p) => fs.readFileSync(p, 'utf-8'),
});

// Load friends data
const friendsData = (await import('../benchmark/templates/friends/data.js')).default;
const friendsTemplate = fs.readFileSync('./benchmark/templates/friends/template.astro', 'utf-8');

const bench = new Bench({ time: 1000 });

bench
  .add('Simple Rendering', () => {
    engine.renderString('<h1>Hello {Astro.props.name}</h1>', { name: 'World' });
  })
  .add('Conditionals (if/else)', () => {
    engine.renderString('{Astro.props.show ? <p>True</p> : <p>False</p>}', { show: true });
  })
  .add('Loop Rendering (Friends)', () => {
    engine.renderString(friendsTemplate, friendsData);
  })
  .add('Nested Loops', () => {
    engine.renderString('<ul>{Astro.props.items.map(i => <li>{i.subs.map(s => <span>{s}</span>)}</li>)}</ul>', {
      items: Array.from({ length: 10 }, (_, i) => ({ subs: [1, 2, 3] }))
    });
  });

// await bench.warmup();
await bench.run();

console.table(bench.table());
