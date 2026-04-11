# AGENT.md

This document provides technical context and guidance for AI agents working on the `astro-template-engine` project.

## Context

The `astro-template-engine` is a runtime-agnostic, Astro-like template engine for rendering HTML. It transforms `.astro` template syntax into efficient JavaScript render functions that produce HTML strings.

### Tech Stack

- **TypeScript**: Source code.
- **Vitest**: Unit and integration tests.
- **fast-check**: Property-based testing for correctness guarantees.

## Architecture

The engine follows a standard pipeline:
**Source Text → Parser → AST → Compiler → Render Function → HTML String**.

- **Parser (`src/parser.ts`)**: Tokenizes and parses raw template text into an Abstract Syntax Tree (AST).
- **AST (`src/types.ts`)**: Intermediate representation of the template, including frontmatter, JSX-like elements, expressions, and component imports.
- **Compiler (`src/compiler.ts`)**: Transforms the AST into a JavaScript closure (`RenderFunction`). It handles component resolution, prop forwarding, slot substitution, and special attributes like `class:list` and `style` objects.
- **Engine (`src/index.ts`)**: Provides the main entry point and orchestrates template loading, resolution, and caching.
- **Cache (`src/cache.ts`)**: Stores compiled `RenderFunction` instances.
- **HTML Escaper (`src/escape.ts`)**: Provides security by default through automatic HTML entity escaping.

## Key Files & Responsibilities

- `src/index.ts`: Public API entry point (`Engine` class).
- `src/parser.ts`: Recursive-descent parser for Astro syntax.
- `src/compiler.ts`: Code generation from AST.
- `src/cache.ts`: LRU cache implementation.
- `src/escape.ts`: HTML escaping and trusted content markers (`RawHtml`).
- `src/types.ts`: Core interfaces and error types.
- `.kiro/specs/`: Detailed requirements, design, and implementation plan.

## Coding Standards & Patterns

1.  **Runtime-Agnostic Core**: Do NOT import Node.js built-ins (`fs`, `path`, `crypto`) in the core rendering pipeline. Use injectable interfaces (like `readFile` and `resolvePath` in `EngineOptions`) for environment-specific I/O.
2.  **Security by Default**: All interpolated expressions MUST be passed through `escapeHtml` unless `autoEscape: false`.
3.  **Error Handling**: Use the custom error types (`LoadError`, `ParseError`, `CompileError`, `RenderError`) defined in `src/types.ts`.
4.  **Requirement Traceability**: When implementing a new feature, refer to the requirements in `.kiro/specs/astro-template-engine/requirements.md` and include relevant requirement IDs in comments.

## Common Agent Tasks

### Adding a New Template Feature

1.  Update `TemplateNode` in `src/types.ts` to include the new node type.
2.  Update the parser in `src/parser.ts` to recognize and produce the new node.
3.  Update the compiler in `src/compiler.ts` to generate code for the new node.
4.  Update the printer in `src/printer.ts` to serialize the new node.
5.  Add unit and property tests to verify the feature and its round-trip property.

### Fixing a Parser Bug

1.  Reproduce the bug with a minimal test case in `src/parser.test.ts`.
2.  Debug the recursive-descent logic in `src/parser.ts`.
3.  Ensure the fix maintains the round-trip property (Property 1) in `src/parser.property.test.ts`.

### Updating the Compiler

1.  Add test cases for the desired output in `src/compiler.test.ts`.
2.  Modify the code generation logic in `src/compiler.ts`.
3.  If the change affects performance, ensure the cache still functions correctly (Properties 6, 7).

## Testing

Run the full test suite:

```bash
npm test
```

Run property-based tests only:

```bash
npm test -- -t property
```

All property tests are tagged with `// Feature: astro-template-engine, Property N: <description>`.
