const path = require('path');
const fs = require('fs');

async function main() {
  const { Eta } = await import('./benchmark/node_modules/eta/dist/index.js');
  const eta = new Eta({ views: path.join(__dirname, 'benchmark', 'templates') });
  const templatePath = path.join(__dirname, 'benchmark', 'templates', 'friends', 'template.eta');
  const templateStr = fs.readFileSync(templatePath, 'utf8');
  
  const compiled = eta.compile(templateStr);
  console.log(compiled.toString());
}
main().catch(console.error);