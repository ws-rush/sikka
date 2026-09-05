# Integrations

Sikka never touches the filesystem — every host injects a **synchronous resolver** that maps a request to template source. That resolver _is_ the integration. Once it exists, wiring Sikka into a server is a few lines.

A complete runnable app lives in [`examples/`](../examples/README.md) (Express and Hono); this doc walks through the pieces.

## The filesystem resolver

```ts
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

resolver(request, importer) {
  const id = importer
    ? resolve(dirname(importer), request)   // relative to the importing template
    : resolve(__dirname, 'views', request); // entry request → your views root
  return { id, source: readFileSync(id, 'utf-8') };
}
```

- `request` is what appears in `render()`/`stream()` or in a frontmatter `import` specifier.
- `importer` is the canonical `id` of the importing template, or `undefined` for the entry request.
- The returned `id` is the cache key: return the **same id for the same file** or caching and invalidation misbehave.
- The resolver must be synchronous — read at request time from memory, a KV snapshot, or sync file I/O. For large trees, front-load sources into a Map and resolve from it.

## Express

```ts
import express from 'express';
import { Sikka } from 'sikka';

const app = express();

app.get('/', (_req, res) => {
  res.send(sikka.render('index.sikka'));
});

app.get('/users/:id', (req, res) => {
  const user = findUser(parseInt(req.params.id));
  if (!user) return res.status(404).send('Not found');
  res.send(sikka.render('user-detail.sikka', { user }));
});

app.get('/stream', async (_req, res) => {
  const gen = sikka.stream('stream', { items: streamItems });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  for await (const chunk of gen) res.write(chunk);
  res.end();
});
```

## Hono

```ts
import { stream } from 'hono/streaming';

app.get('/', (c) => c.html(sikka.render('index.sikka')));

app.get('/stream', async (c) => {
  const gen = sikka.stream('stream', { items: streamItems });
  return stream(c, async (s) => {
    for await (const chunk of gen) await s.write(chunk);
  });
});
```

## Streaming notes

- `stream()` yields the same total output as `render()` — you can stream to any async sink.
- Set `Content-Type: text/html; charset=utf-8` before writing; chunked transfer is negotiated by the server.
- Frontmatter `await` works only in `stream()` renders (see [Errors](07-errors.md#frontmatter-await)).

## Runtime-agnostic by design

The resolver is the only I/O Sikka sees. Node's `fs` above is one choice — a Workers build could resolve from a bundled in-memory map of sources, and precompiled mode ([Precompiling](04-precompile.md)) removes runtime compilation entirely. See [Choosing a mode](01-getting-started.md#choosing-a-mode).
