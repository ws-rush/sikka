import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { describe, it } from 'node:test';
import { chromium } from '@playwright/test';
import { expect } from './assert.js';
import { wrapPrecompiledModule } from './corpus.mjs';
import { compile } from '../src/precompile.js';
import { RUNTIME_ABI_VERSION } from '../src/runtime.js';
import { syntaxContractCases } from './syntax-contract.js';

const CSP = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'";
const REPORT_TYPE = 'sikka-strict-csp-report';
const ada = syntaxContractCases.find((case_) => case_.id === 'ada-escaping-and-list');

if (!ada) throw new Error('Missing Ada Syntax Contract case');

type Report = {
  type: string;
  ok: boolean;
  caseId: string;
  csp: string;
  runtimeAbiVersion?: number;
  error?: string;
};

function adaModule(): string {
  const [artifact] = compile(ada.id, {
    resolver: (request) => ({ id: request, source: ada.template }),
  });
  return wrapPrecompiledModule(artifact, '/sikka/runtime.js', () => {
    throw new Error('Ada has no components');
  });
}

function worker(): string {
  return `import { render, stream } from '/ada.sikka.mjs';
import { RUNTIME_ABI_VERSION, runtime } from '/sikka/runtime.js';

const CASE_ID = ${JSON.stringify(ada.id)};
const CSP = ${JSON.stringify(CSP)};
const EXPECTED_HTML = ${JSON.stringify(ada.expectedHtml)};
const PROPS = ${JSON.stringify(ada.props)};
const REPORT_TYPE = ${JSON.stringify(REPORT_TYPE)};

self.addEventListener('message', (event) => {
  event.waitUntil((async () => {
    const report = { type: REPORT_TYPE, ok: false, caseId: CASE_ID, csp: CSP };
    try {
      if (event.data?.caseId !== CASE_ID) throw new Error('Unexpected case ID');
      if (RUNTIME_ABI_VERSION !== ${RUNTIME_ABI_VERSION} || typeof runtime !== 'function') {
        throw new Error('Unexpected sikka/runtime ABI');
      }
      const html = render(PROPS);
      const chunks = [];
      for await (const chunk of stream(PROPS)) chunks.push(chunk);
      if (html !== EXPECTED_HTML || chunks.join('') !== EXPECTED_HTML) {
        throw new Error('Ada rendered unexpected HTML');
      }
      report.ok = true;
      report.runtimeAbiVersion = RUNTIME_ABI_VERSION;
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
    }
    if (!event.source) throw new Error('Missing service worker client');
    event.source.postMessage(report);
  })());
});
`;
}

function controller(): string {
  return `const CASE_ID = ${JSON.stringify(ada.id)};
const CSP = ${JSON.stringify(CSP)};
const REPORT_TYPE = ${JSON.stringify(REPORT_TYPE)};

window.strictCspReport = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for service worker report')), 5000);
  navigator.serviceWorker.addEventListener('message', ({ data }) => {
    clearTimeout(timeout);
    if (!data || data.type !== REPORT_TYPE) return reject(new Error('Invalid service worker report'));
    if (data.caseId !== CASE_ID) return reject(new Error('Unexpected service worker case ID'));
    if (data.csp !== CSP) return reject(new Error('Unexpected service worker CSP'));
    if (!data.ok) return reject(new Error(data.error || 'Service worker assertion failed'));
    resolve(data);
  }, { once: true });
  (async () => {
    const registration = await navigator.serviceWorker.register('/worker.js', { type: 'module' });
    const active = (await navigator.serviceWorker.ready).active ?? registration.active;
    if (!active) throw new Error('Service worker did not activate');
    active.postMessage({ caseId: CASE_ID });
  })().catch((error) => {
    clearTimeout(timeout);
    reject(error);
  });
});
`;
}

async function runtimeModule(path: string): Promise<string> {
  return stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8'), {
    mode: 'transform',
    sourceMap: false,
  });
}

async function server(files: Record<string, string>) {
  const instance = createServer((request, response) => {
    const body = files[new URL(request.url ?? '/', 'http://localhost').pathname];
    response.writeHead(body === undefined ? 404 : 200, {
      'content-security-policy': CSP,
      'content-type': body?.startsWith('<') ? 'text/html' : 'text/javascript',
    });
    response.end(body);
  });
  await new Promise<void>((resolve, reject) =>
    instance.listen(0, '127.0.0.1', resolve).once('error', reject)
  );
  const address = instance.address();
  if (!address || typeof address === 'string') throw new Error('Could not start localhost server');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        instance.close((error) => (error ? reject(error) : resolve()))
      ),
  };
}

describe('strict-CSP precompiled Ada sentinel', () => {
  it('runs the Ada artifact inside a real module service worker', async () => {
    const module = adaModule();
    expect(module).not.toContain('eval');
    expect(module).not.toContain('Function');
    const host = await server({
      '/': '<script type="module" src="/controller.js"></script>',
      '/controller.js': controller(),
      '/worker.js': worker(),
      '/ada.sikka.mjs': module,
      '/sikka/runtime.js': await runtimeModule('../src/runtime.ts'),
      '/sikka/escape.js': await runtimeModule('../src/escape.ts'),
    });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(host.url);
      const report = (await page.evaluate(
        () => (window as Window & { strictCspReport: Promise<Report> }).strictCspReport
      )) as Report;
      expect(report).toEqual({
        type: REPORT_TYPE,
        ok: true,
        caseId: ada.id,
        csp: CSP,
        runtimeAbiVersion: RUNTIME_ABI_VERSION,
      });
    } finally {
      await browser.close();
      await host.close();
    }
  });
});
