import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MatmaError } from './errors.js';

export const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const EXCLUDED = new Set(['node_modules', '.git', '.hg', '.svn', '.next', '.nuxt', '.cache', '.tools', 'coverage', 'dist', 'build', 'out', 'vendor', 'tests', 'test', '__tests__', 'fixtures', 'integrations', 'AIDocumentation', '.claude', '.agents']);
export const slash = text => text.replaceAll('\\', '/');
export const hash = text => createHash('sha256').update(text).digest('hex');
export const rel = (root, file) => slash(path.relative(root, file));

export function inside(root, destination) {
  const relative = path.relative(path.resolve(root), path.resolve(destination));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function safeOutput(root, relativePath) {
  const destination = path.resolve(root, relativePath);
  if (!inside(root, destination) || relativePath.split(/[\\/]+/).includes('..')) {
    throw new MatmaError('unsafe_path', `Refusing destination outside project: ${relativePath}`);
  }
  let current = path.resolve(root);
  for (const segment of path.relative(current, destination).split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new MatmaError('unsafe_symlink', `Refusing symlinked output: ${current}`);
    }
  }
  return destination;
}

export function projectConfig(root, cliRoots = []) {
  let configured = {};
  const configPath = path.join(root, 'matma.config.json');
  if (fs.existsSync(configPath)) {
    try { configured = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
    catch (error) { throw new MatmaError('invalid_config', `Invalid matma.config.json: ${error.message}`); }
  }
  const sourceRoots = cliRoots.length ? cliRoots : configured.sourceRoots?.length ? configured.sourceRoots : fs.existsSync(path.join(root, 'src')) ? ['src'] : ['.'];
  const roots = [...new Set(sourceRoots.map(value => {
    if (typeof value !== 'string' || path.isAbsolute(value)) throw new MatmaError('invalid_source_root', `Unsafe source root: ${value}`);
    const full = path.resolve(root, value);
    if (!inside(root, full) || !fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
      throw new MatmaError('invalid_source_root', `Source root does not exist inside project: ${value}`);
    }
    safeOutput(root, rel(root,full)); // Reject symlinked ancestor directories, even if lexically inside the project.
    if (fs.lstatSync(full).isSymbolicLink()) throw new MatmaError('unsafe_symlink', `Source root is a symlink: ${value}`);
    return full;
  }))];
  return { root, roots };
}

export function inventory(config) {
  const files = new Set();
  const directories = new Map();
  const visit = directory => {
    if (directories.has(directory)) return;
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const accepted = [];
    for (const entry of entries) {
      if (EXCLUDED.has(entry.name) || entry.name.startsWith('.')) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        accepted.push(`D:${entry.name}`);
        visit(path.join(directory, entry.name));
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        accepted.push(`F:${entry.name}`);
        files.add(path.join(directory, entry.name));
      }
    }
    directories.set(directory, hash(accepted.sort().join('\n')));
  };
  for (const root of config.roots) visit(root);
  return {
    files: [...files].sort().map(full => ({ full, path: rel(config.root, full), hash: hash(fs.readFileSync(full)) })),
    directories: Object.fromEntries([...directories].map(([dir, fingerprint]) => [rel(config.root, dir) || '.', fingerprint]).sort(([a], [b]) => a.localeCompare(b)))
  };
}

export function checkFreshness(root, index) {
  const config = projectConfig(root, index.source_roots || []);
  for (const item of index.project_inputs || []) {
    const full = safeOutput(root, item.path);
    const current = fs.existsSync(full) ? hash(fs.readFileSync(full)) : null;
    if (current !== item.hash) throw new MatmaError('stale_index', `Project configuration changed: ${item.path}; run index`);
  }
  for (const item of index.files || []) {
    const full = safeOutput(root, item.path);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile() || hash(fs.readFileSync(full)) !== item.hash) {
      throw new MatmaError('stale_index', `Source changed since index: ${item.path}; run matma-indexer index`);
    }
  }
  // Check known directories without traversing the entire source tree again.
  for (const [dir, expected] of Object.entries(index.directories || {})) {
    const full = safeOutput(root, dir);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new MatmaError('stale_index', `Source directory changed: ${dir}; run index`);
    const entries = fs.readdirSync(full, { withFileTypes: true }).filter(e => !EXCLUDED.has(e.name) && !e.name.startsWith('.') && !e.isSymbolicLink()).flatMap(e => e.isDirectory() ? [`D:${e.name}`] : e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name)) ? [`F:${e.name}`] : []).sort();
    if (hash(entries.join('\n')) !== expected) throw new MatmaError('stale_index', `Source inventory changed in ${dir}; run index`);
  }

}

export function slug(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'default';
}

export function mirrors(sourceFile, name, testsRoot = 'tests') {
  const part = `${sourceFile}/${slug(name)}`;
  return {
    unit_test: `${testsRoot}/unit/mirror/${sourceFile}/test_${slug(name)}.test.mjs`,
    interaction_test: `${testsRoot}/interaction/mirror/${sourceFile}/test_${slug(name)}_interaction.test.mjs`,
    mock_file: `${testsRoot}/mocks/mirror/${sourceFile}/mock_${slug(name)}.mjs`,
    manifest: `${testsRoot}/mirror/${part}.auto.yaml`
  };
}
