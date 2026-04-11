# Benchmarks

This directory contains benchmarks comparing our custom template engine with Eta.

## Structure

- `our-engine/`: Hono-node project using the local template engine.
- `eta/`: Hono-node project using the Eta template engine.
- `run-bench.js`: Benchmark runner using `autocannon`.

## Running the benchmark

1. Install dependencies in the root and in the benchmark subdirectories:
   ```bash
   pnpm install
   cd benchmarks
   pnpm install
   cd our-engine && pnpm install
   cd ../eta && pnpm install
   ```
2. Run the benchmark:
   ```bash
   cd benchmarks
   node run-bench.js
   ```

## Methodology

Both engines render a similar page containing:

- A title.
- A list of 100 items.
- Each item is rendered using a component (our engine) or a partial (Eta).

The benchmark measures throughput (requests per second) and latency distribution over a 10-second period with 100 concurrent connections.
