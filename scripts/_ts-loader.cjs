/* Charge des fichiers .ts (imports sans extension, comme dans l'app) pour les tests Node : transpilation à la volée. */
const Module = require('module'); const path = require('path'); const fs = require('fs');
const ts = require(path.resolve(__dirname, '..', 'node_modules', 'typescript'));
require.extensions['.ts'] = (m, file) => {
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2020' } }).outputText, file);
};
module.exports = (rel) => require(path.resolve(__dirname, '..', rel));
