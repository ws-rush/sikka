import express from 'express';
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

const app = express();

app.use(express.static(resolve(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Method override — reads _method from parsed body
app.use((req, _res, next) => {
  if (req.method === 'POST' && req.body?._method) {
    req.method = req.body._method.toUpperCase();
  }
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.send(engine.render('index.astro'));
});

app.get('/about', (_req, res) => {
  res.send(engine.render('about.astro', { team }));
});

app.get('/users', (_req, res) => {
  res.send(engine.render('users.astro', { users }));
});

app.get('/users/:id', (req, res) => {
  const user = findUser(parseInt(req.params.id));
  if (!user) return res.status(404).send('Not found');
  res.send(engine.render('user-detail.astro', { user }));
});

app.get('/about/:index', (req, res) => {
  const member = findTeamMember(parseInt(req.params.index));
  if (!member) return res.status(404).send('Not found');
  res.send(engine.render('team-detail.astro', { member }));
});

app.get('/stream', async (_req, res) => {
  const gen = engine.streamString(streamTemplate, { items: streamItems });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  for await (const chunk of gen) {
    res.write(chunk);
  }
  res.end();
});

app.get('/todos', (_req, res) => {
  res.send(engine.render('todos.astro', { todos }));
});

app.post('/todos', (req, res) => {
  addTodo(req.body.text);
  res.redirect('/todos');
});

app.post('/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (req.method === 'PUT') {
    if (!findTodo(id)) return res.status(404).send('Not found');
    if (req.body.action === 'toggle') toggleTodo(id);
    else if (req.body.action === 'edit') editTodo(id, req.body.text);
  } else if (req.method === 'DELETE') {
    deleteTodo(id);
  }
  res.redirect('/todos');
});

app.put('/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!findTodo(id)) return res.status(404).send('Not found');
  if (req.body.action === 'toggle') toggleTodo(id);
  else if (req.body.action === 'edit') editTodo(id, req.body.text);
  res.redirect('/todos');
});

app.delete('/todos/:id', (req, res) => {
  deleteTodo(parseInt(req.params.id));
  res.redirect('/todos');
});

// ── Start ──────────────────────────────────────────────────────────────────

const port = 3000;
app.listen(port, () => {
  console.log(`Express server running at http://localhost:${port}`);
});
