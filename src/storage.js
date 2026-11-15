import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { MatmaError } from './errors.js';
import { safeOutput, hash } from './project.js';

export const HEADER = '# MATMA-JS GENERATED; DO NOT EDIT; schema v1\n';
export const INDEX = 'tests/mirror/.index.auto.yaml';
export const PREVIOUS = 'tests/mirror/.previous-index.auto.yaml';

export function readGenerated(root, relative, optional = false) {
  const pathname = safeOutput(root, relative);
  if (!fs.existsSync(pathname)) {
    if (optional) return null;
    throw new MatmaError('missing_index', `Missing ${relative}; run matma-indexer index`);
  }
  const text = fs.readFileSync(pathname, 'utf8');
  if (!text.startsWith(HEADER)) throw new MatmaError('foreign_manifest', `Refusing unowned or incompatible index: ${relative}`);
  try {
    const value = YAML.parse(text.slice(HEADER.length), { uniqueKeys: true });
    if (!value || value.schema_version !== 1 || value.generator !== 'matma-js') throw new Error('invalid generator/schema');
    return value;
  } catch (error) { throw new MatmaError('invalid_manifest', `Invalid ${relative}: ${error.message}`); }
}

function body(value) {
  return HEADER + YAML.stringify(value, { indent: 2, lineWidth: 0 });
}

export function preflightGenerated(root, files) {
  for (const relative of Object.keys(files)) {
    const full = safeOutput(root, relative);
    if (fs.existsSync(full) && !fs.readFileSync(full, 'utf8').startsWith(HEADER)) {
      throw new MatmaError('foreign_manifest', `Refusing to replace unowned ${relative}`);
    }
  }
}

export function writeGenerated(root, files) {
  preflightGenerated(root, files);
  for (const [relative, value] of Object.entries(files).sort(([a],[b]) => a.localeCompare(b))) {
    const destination = safeOutput(root, relative);
    const content = body(value);
    if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') === content) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temp = `${destination}.matma-tmp-${process.pid}`;
    try { fs.writeFileSync(temp, content, { flag: 'wx' }); fs.renameSync(temp, destination); }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
}

export function readRegistry(root, testRoot = 'tests') {
  const relative = `${testRoot}/matma-verification.yaml`;
  const pathname = safeOutput(root, relative);
  if (!fs.existsSync(pathname)) return { schema_version: 1, registrations: {} };
  let data;
  try { data = YAML.parse(fs.readFileSync(pathname, 'utf8'), { uniqueKeys: true }); }
  catch (error) { throw new MatmaError('invalid_registry', `${relative}: ${error.message}`); }
  if (data?.schema_version !== 1 || !data.registrations || typeof data.registrations !== 'object' || Array.isArray(data.registrations)) {
    throw new MatmaError('invalid_registry', `Expected schema_version: 1 and registrations object in ${relative}`);
  }
  return data;
}

export function resolveRegistry(root, index, symbolIds, testRoot = 'tests') {
  const registry = readRegistry(root, testRoot);
  const result = { business: new Set(), regression: new Set(), missing: new Set() };
  for (const key of symbolIds) {
    const entry = registry.registrations[key];
    if (!entry) continue;
    for (const tier of ['business', 'regression']) {
      if (!Array.isArray(entry[tier] || [])) throw new MatmaError('invalid_registry', `Expected ${tier} array for ${key}`);
      for (const target of entry[tier] || []) {
        if (typeof target !== 'string' || !target.startsWith(`${testRoot}/${tier}/`) || !/\.(?:c|m)?js$/.test(target)) throw new MatmaError('invalid_registry', `Invalid ${tier} test path ${target}`);
        const full = safeOutput(root, target);
        if (fs.existsSync(full)) result[tier].add(target);
        else result.missing.add(target);
      }
    }
  }
  const unknown = Object.keys(registry.registrations).filter(key => !index.symbols.some(s => s.id === key));
  return { business: [...result.business].sort(), regression: [...result.regression].sort(), missing: [...result.missing].sort(), unknown_registrations: unknown.sort() };
}

export function fingerprintIndex(index) {
  return hash(JSON.stringify({ symbols: index.symbols.map(s => [s.id,s.fingerprint,s.public,s.exports]), edges: index.edges }));
}
