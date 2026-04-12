const fs = require('fs');
const path = require('path');

async function main() {
  const engineModule = await import('./dist/esm/index.js');
  const Engine = engineModule.Engine;
  const engine = new Engine({
    cache: true,
    readFile: (p) => fs.promises.readFile(p, 'utf-8'),
    readFileSync: (p) => fs.readFileSync(p, 'utf-8'),
    resolvePath: (base, specifier) => path.resolve(path.dirname(base), specifier),
  });

  const templatePath = './benchmark/templates/friends/template.astro';
  const data = require('./benchmark/templates/friends/data.js');
  
  const content = fs.readFileSync(templatePath, 'utf-8');
  
  // Use private method or just run it to populate cache, then grab it?
  // We can just use engine.compileFileSync? It's private.
  // Let's use engine.renderString, it's public, but doesn't expose the function.
  // Actually, we can import compileSync directly.
  const { parse } = await import('./dist/esm/parser.js');
  const { compileSync } = await import('./dist/esm/compiler.js');
  
  const parseResult = parse(content);
  const result = compileSync(parseResult.ast, { fileReader: () => content, basePath: templatePath });
  
  console.log(result.source);
}
main();
