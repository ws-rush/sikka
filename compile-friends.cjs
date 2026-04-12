const fs = require('fs');
const path = require('path');

async function main() {
  const templatePath = './benchmark/templates/friends/template.astro';
  const content = fs.readFileSync(templatePath, 'utf-8');
  
  const { parse } = await import('./dist/esm/parser.js');
  const { compileSync } = await import('./dist/esm/compiler.js');
  
  const parseResult = parse(content);
  const result = compileSync(parseResult.ast, { fileReader: () => content, basePath: templatePath });
  
  console.log(result.source);
}
main().catch(console.error);