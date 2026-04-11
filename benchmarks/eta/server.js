import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Eta } from 'eta';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const eta = new Eta({ views: path.join(__dirname, 'views'), cache: true });

const app = new Hono();

const items = Array.from({ length: 100 }, (_, i) => ({
  name: `Item ${i}`,
  description: `This is the description for item ${i}.`,
}));

app.get('/', async (c) => {
  const html = await eta.render('index', { title: 'Benchmark', items });
  return c.html(html);
});

const port = Number(process.env.PORT) || 3002;
console.log(`Eta server starting on port ${port}`);
serve({
  fetch: app.fetch,
  port,
});
