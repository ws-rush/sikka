const path = require('path');
const fs = require('fs');

let Engine;
let engine;

module.exports = {
  name: 'astro',
  ext: 'astro',
  async init() {
    if (!Engine) {
      // Import the ESM engine from the dist directory
      const engineModule = await import('../../dist/esm/index.js');
      Engine = engineModule.Engine;
      engine = new Engine({
        cache: true,
        // Since the benchmark main.js calls engine.render(templatePath, data),
        // we need to handle both absolute and relative paths.
        // main.js passes relative paths like './templates/friends/template.astro'
        readFile: (p) => fs.readFileSync(p, 'utf-8'),
        resolvePath: (base, specifier) => path.resolve(path.dirname(base), specifier),
      });
    }
  },
  render: function(templatePath, data) {
    // engine.render in astro-template-engine is async
    // but the benchmark bench function expects a synchronous call for some engines?
    // Let's check main.js again.
    return engine.render(templatePath, data);
  }
};
