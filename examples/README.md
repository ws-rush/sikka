# Sikka Examples

Express and Hono applications using Sikka source mode.

```bash
nub install
nub run start:express
# or
nub run start:hono
```

Each entrypoint provides a synchronous source resolver. It maps entry requests
to `views/` and Frontmatter Component requests relative to their importing
canonical identity. Components are explicitly imported from Frontmatter; the
stream route is an entry Template rendered with `sikka.stream('stream', props)`.
