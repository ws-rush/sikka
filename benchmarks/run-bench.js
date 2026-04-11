import autocannon from 'autocannon';
import { spawn } from 'node:child_process';
import waitOn from 'wait-on';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function killPort(port) {
  try {
    execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
  } catch {
    // Ignore errors (e.g. port already free)
  }
}

async function runBenchmark(name, port, command, args, cwd) {
  console.log(`\n--- Benchmarking ${name} on port ${port} ---`);

  killPort(port);

  const server = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, PORT: port.toString() },
  });

  try {
    await waitOn({ resources: [`http://localhost:${port}`], timeout: 10000 });

    const results = await autocannon({
      url: `http://localhost:${port}`,
      connections: 100,
      duration: 10,
    });

    autocannon.printResult(results);
    return results;
  } finally {
    server.kill();
  }
}

function printDetailed(name, results) {
  console.log(`\nDetailed results for ${name}:`);
  console.log(`Throughput: ${results.requests.average.toFixed(2)} req/sec`);
  console.log(`Latency (ms):`);
  console.log(`  Mean: ${results.latency.average.toFixed(2)}`);
  console.log(`  P50:  ${results.latency.p50}`);
  console.log(`  P90:   ${results.latency.p90}`);
  console.log(`  P97.5: ${results.latency.p97_5}`);
  console.log(`  P99:   ${results.latency.p99}`);
}

async function main() {
  const ourResults = await runBenchmark(
    'Our Engine',
    3001,
    'node',
    ['server.js'],
    path.join(__dirname, 'our-engine')
  );

  const etaResults = await runBenchmark(
    'Eta',
    3002,
    'node',
    ['server.js'],
    path.join(__dirname, 'eta')
  );

  printDetailed('Our Engine', ourResults);
  printDetailed('Eta', etaResults);

  console.log('\n--- Comparison ---');
  console.log(`Our Engine: ${ourResults.requests.average.toFixed(2)} req/sec`);
  console.log(`Eta:        ${etaResults.requests.average.toFixed(2)} req/sec`);

  const diff = ((ourResults.requests.average / etaResults.requests.average) * 100).toFixed(2);
  console.log(`\nOur Engine is ${diff}% as fast as Eta`);
}

main().catch(console.error);
