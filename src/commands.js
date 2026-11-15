import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { MatmaError } from './errors.js';
import { computeIndex, writeIndex } from './indexer.js';
import { checkFreshness, safeOutput } from './project.js';
import { readGenerated, readRegistry, resolveRegistry } from './storage.js';
import { impacts, changes } from './graph.js';
import { scaffold } from './scaffold.js';

const indexPath = testRoot => `${testRoot}/mirror/.index.auto.yaml`;
function readIndex(root, testRoot) {
  const index = readGenerated(root, indexPath(testRoot));
  checkFreshness(root, index);
  return index;
}

export function resolveTarget(index, target, publicOnly = false) {
  if (!target) throw new MatmaError('missing_target', 'Specify --target <symbol-id-or-qualified-name>');
  const matches = index.symbols.filter(s =>
    (!publicOnly || s.public) && (s.id === target || s.name === target || `${s.file}#${s.name}` === target || s.file === target || s.exports.includes(target)));
  if (!matches.length) throw new MatmaError('invalid_target', `Unknown ${publicOnly?'public ':''}symbol ${target}`);
  if (matches.length !== 1) throw new MatmaError('ambiguous_target', `Ambiguous ${target}. Specify exact file#symbol`, { matches: matches.map(m=>m.id) });
  return matches[0];
}

function verifiedPaths(root, result) {
  const found = { unit: [], interaction: [], missing: [] };
  for (const key of ['unit','interaction']) for (const file of result.tests[key]) {
    if (fs.existsSync(safeOutput(root, file))) found[key].push(file);
    else found.missing.push(file);
  }
  return found;
}

export function execute(command, args = {}) {
  const root = path.resolve(args.root || process.cwd());
  const testRoot = args.testRoot || 'tests';
  if (!/^[a-zA-Z0-9_./-]+$/.test(testRoot) || path.isAbsolute(testRoot)) throw new MatmaError('invalid_option','Unsafe --tests-root');
  if (command === 'index' || command === 'validate') {
    const { index, stats } = computeIndex(root, args.sourceRoots || [], testRoot);
    if (command === 'index') {
      const written = writeIndex(root, index, testRoot);
      const scaffoldResult = args.scaffold ? scaffold(root, args.target ? [resolveTarget(index, args.target, true)] : index.symbols.filter(s=>s.public), {testRoot}) : null;
      return { command, stats, written_manifests: written.length, warnings: index.diagnostics, ...(scaffoldResult && { scaffold: scaffoldResult }) };
    }
    const expected = index.symbols.filter(s => s.public).flatMap(s => [s.mirrors.unit_test, s.mirrors.interaction_test, s.mirrors.mock_file]);
    if (index.symbols.some(s => s.public && s.uses_fetch)) expected.push(`${testRoot}/mocks/mirror/_external/mock_fetch.mjs`);
    const missing = expected.filter(f => !fs.existsSync(safeOutput(root,f))).sort();
    const unimplemented = index.symbols.filter(s=>s.public).flatMap(s=>[s.mirrors.unit_test,s.mirrors.interaction_test]).filter(f=> fs.existsSync(safeOutput(root,f)) && fs.readFileSync(safeOutput(root,f),'utf8').includes('throw new Error("MATMA: implement'));
    const diagnostics = [...index.diagnostics];
    const isolationReview = diagnostics.filter(d => d.code==='injection_seam_review');
    const validation = { command, stats, missing, unimplemented, warnings: diagnostics,
      isolation_review_required: isolationReview,
      valid: !missing.length && !unimplemented.length && !diagnostics.some(d=>d.code==='syntax_error'),
      note: 'valid assesses structural artifacts and unfinished starters, not automatic proof of real-versus-mock isolation' };
    if (args.check && !validation.valid) throw new MatmaError('validation_failed','Missing or unfinished mirrored tests/mocks',validation);
    return validation;
  }
  if (command === 'scaffold') {
    const index = readIndex(root, testRoot);
    const selected = args.target ? [resolveTarget(index, args.target, true)] : index.symbols.filter(s=>s.public);
    return { command, symbols: selected.map(s=>s.id), ...scaffold(root, selected, {testRoot}), warnings: selected.some(s=>s.uses_fetch) ? ['External HTTP failures require authored assertions for each applicable scenario'] : [] };
  }
  if (command === 'impact') {
    const index = readIndex(root, testRoot);
    const target = resolveTarget(index, args.target);
    const impact = impacts(index, target.id, args.level ?? 0);
    const tests = verifiedPaths(root, impact);
    const verification = resolveRegistry(root,index,impact.affected_symbols.map(s=>s.id),testRoot);
    return { command, target: target.id, level: args.level ?? 0, affected_symbols: impact.affected_symbols, affected_sources: impact.affected_sources, tests, verification, warnings: index.diagnostics, analysis_limits: ['Static JS analysis cannot prove runtime dynamic imports, injected dependencies, or successful mock isolation.'] };
  }
  if (command === 'changes') {
    const index = readIndex(root,testRoot);
    const previous = readGenerated(root, `${testRoot}/mirror/.previous-index.auto.yaml`, true);
    if (!previous) throw new MatmaError('missing_previous_index', 'No earlier indexed revision; edit source then explicitly index before comparing changes');
    const result = changes(previous,index,args.level??2);
    const affected = { tests: { unit: new Set(), interaction: new Set() } };
    for (const id of result.selected_targets) {
      const symbol = index.symbols.find(s=>s.id===id) || previous?.symbols.find(s=>s.id===id);
      if (!symbol) continue;
      affected.tests.unit.add(symbol.mirrors.unit_test);
      if ((args.level??2)>=1) affected.tests.interaction.add(symbol.mirrors.interaction_test);
    }
    const tests = verifiedPaths(root,{ tests: { unit: [...affected.tests.unit], interaction: [...affected.tests.interaction] } });
    return { command, level: args.level??2, previous_index_available: Boolean(previous), ...result, tests, warnings: index.diagnostics };
  }
  if (command === 'context') {
    const index = readIndex(root,testRoot);
    const target = resolveTarget(index,args.target);
    const body = fs.readFileSync(safeOutput(root,target.file),'utf8');
    return { command, target: target.id, file: target.file, line: target.line,
      region: body.slice(target.start,target.end), dependencies: index.edges.filter(e=>e.from===target.id),
      dependents: index.edges.filter(e=>e.to===target.id), warnings: index.diagnostics.filter(d=>d.file===target.file) };
  }
  throw new MatmaError('invalid_command',`Unknown command: ${command}`);
}
