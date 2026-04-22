import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { stream } from 'hono/streaming';
import { Engine } from 'sikka';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  todos,
  team,
  users,
  streamItems,
  streamTemplate,
  addTodo,
  toggleTodo,
  editTodo,
  deleteTodo,
  findTodo,
  findUser,
  findTeamMember,
} from './data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const engine = new Engine({
  views: resolve(__dirname, 'views'),
  readFile: (p: string) => readFileSync(p, 'utf-8'),
});

// Register Card as a global component
const cardTemplate = readFileSync(resolve(__dirname, 'components', 'Card.astro'), 'utf-8');
engine.loadComponent('Card', cardTemplate);

// ── App setup ──────────────────────────────────────────────────────────────

type Variables = { body: Record<string, string | File> };
const app = new Hono<{ Variables: Variables }>();

app.use('/styles.css', serveStatic({ path: './public/styles.css' }));

// Method override — parses body, stashes it, overrides method
app.use('/todos/*', async (c, next) => {
  if (c.req.method === 'POST') {
    const body = await c.req.parseBody();
    if (body._method && typeof body._method === 'string') {
      c.req.raw = new Request(c.req.url, {
        method: body._method.toUpperCase(),
        headers: c.req.raw.headers,
      });
    }
    c.set('body', body as Record<string, string | File>);
  }
  await next();
});

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/', (c) => c.html(engine.render('index.astro')));

app.get('/about', (c) => c.html(engine.render('about.astro', { team })));

app.get('/users', (c) => c.html(engine.render('users.astro', { users })));

app.get('/users/:id', (c) => {
  const user = findUser(parseInt(c.req.param('id')));
  if (!user) return c.notFound();
  return c.html(engine.render('user-detail.astro', { user }));
});

app.get('/about/:index', (c) => {
  const member = findTeamMember(parseInt(c.req.param('index')));
  if (!member) return c.notFound();
  return c.html(engine.render('team-detail.astro', { member }));
});

app.get('/stream', async (c) => {
  const gen = engine.streamString(streamTemplate, { items: streamItems });
  return stream(c, async (s) => {
    for await (const chunk of gen) {
      await s.write(chunk);
    }
  });
});

app.get('/todos', (c) => c.html(engine.render('todos.astro', { todos })));

app.post('/todos', async (c) => {
  const body = c.get('body') || (await c.req.parseBody());
  addTodo(body.text as string);
  return c.redirect('/todos');
});

app.post('/todos/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const method = c.req.method;
  const body = c.get('body') || (await c.req.parseBody());

  if (method === 'PUT') {
    if (!findTodo(id)) return c.notFound();
    if (body.action === 'toggle') toggleTodo(id);
    else if (body.action === 'edit') editTodo(id, body.text as string);
  } else if (method === 'DELETE') {
    deleteTodo(id);
  }

  return c.redirect('/todos');
});

// ── Start ──────────────────────────────────────────────────────────────────

const port = 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`Hono server running at http://localhost:${port}`);
});
