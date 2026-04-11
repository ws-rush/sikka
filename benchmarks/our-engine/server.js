import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Engine } from '../../dist/esm/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const engine = new Engine({
  views: path.join(__dirname, 'views'),
  readFile: (file) => fs.readFile(file, 'utf-8'),
  cache: true,
});

const app = new Hono();

const items = Array.from({ length: 100 }, (_, i) => ({
  name: `Item ${i}`,
  description: `This is the description for item ${i}.`,
}));

app.get('/', async (c) => {
  const html = await engine.render('index.astro', { title: 'Benchmark', items });
  return c.html(html);
});

const port = Number(process.env.PORT) || 3001;
console.log(`Our engine server starting on port ${port}`);
serve({
  fetch: app.fetch,
  port,
});
