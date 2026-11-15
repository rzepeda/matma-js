import fs from 'node:fs';
import path from 'node:path';
import { inventory, projectConfig, rel, safeOutput, hash } from './project.js';
import { analyze } from './analyzer.js';
import { fingerprintIndex, INDEX, PREVIOUS, readGenerated, writeGenerated } from './storage.js';
import { MatmaError } from './errors.js';

const hashFile = file => hash(fs.readFileSync(file));

export function computeIndex(root, roots = [], testRoot = 'tests') {
  const config = projectConfig(root, roots);
  const snapshot = inventory(config);
  const result = analyze(config, snapshot, testRoot);
  if (result.diagnostics.some(d => d.code === 'syntax_error')) {
    throw new MatmaError('syntax_error', 'Source contains JavaScript syntax errors', { diagnostics: result.diagnostics.filter(d=>d.code==='syntax_error') });
  }
  const index = {
    generator: 'matma-js', schema_version: 1,
    source_roots: config.roots.map(folder => rel(root, folder) || '.'),
    files: snapshot.files.map(({path: file, hash}) => ({ path: file, hash })),
    project_inputs: ['package.json','matma.config.json'].map(file => ({path: file, hash: fs.existsSync(path.join(root,file)) ? hashFile(path.join(root,file)) : null})),
    directories: snapshot.directories,
    symbols: result.symbols, edges: result.edges, diagnostics: result.diagnostics
  };
  return { index, stats: { files: index.files.length, symbols: index.symbols.length, public_symbols: index.symbols.filter(s=>s.public).length, dependencies: index.edges.length, diagnostics: index.diagnostics.length } };
}

export function writeIndex(root, index, testRoot = 'tests') {
  const currentName = `${testRoot}/mirror/.index.auto.yaml`;
  const previousName = `${testRoot}/mirror/.previous-index.auto.yaml`;
  const previous = readGenerated(root, currentName, true);
  const files = { [currentName]: index };
  if (previous && fingerprintIndex(previous) !== fingerprintIndex(index)) files[previousName] = previous;
  for (const symbol of index.symbols) {
    const dependents = index.edges.filter(e => e.to === symbol.id).map(e => ({ id: e.from, weight: e.weight, kind: e.kind }));
    const dependencies = index.edges.filter(e => e.from === symbol.id).map(e => ({ id: e.to, weight: e.weight, kind: e.kind }));
    files[symbol.mirrors.manifest] = {
      generator: 'matma-js', schema_version: 1, id: symbol.id, file: symbol.file, name: symbol.name, kind: symbol.kind,
      public: symbol.public, exports: symbol.exports, fingerprint: symbol.fingerprint,
      source_region: { start: symbol.start, end: symbol.end, line: symbol.line },
      uses_fetch: symbol.uses_fetch, external_dependencies: symbol.external_dependencies, mirrors: symbol.mirrors, dependencies, dependents
    };
  }
  writeGenerated(root, files);
  // Remove only stale MATMA-owned symbol manifests; no source or user test content is touched.
  if (previous) {
    for (const symbol of previous.symbols) {
      const oldPath = symbol.mirrors.manifest;
      if (files[oldPath]) continue;
      const absolute = safeOutput(root, oldPath);
      if (!fs.existsSync(absolute)) continue;
      // Deliberately use the same generator-ownership check as index writes.
      if (!fs.readFileSync(absolute,'utf8').startsWith('# MATMA-JS GENERATED; DO NOT EDIT; schema v1\n')) throw new MatmaError('foreign_manifest', `Refusing stale manifest deletion: ${oldPath}`);
      fs.unlinkSync(absolute);
    }
  }
  return Object.keys(files).sort();
}
