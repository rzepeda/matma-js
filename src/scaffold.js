import fs from 'node:fs';
import path from 'node:path';
import { MatmaError } from './errors.js';
import { safeOutput } from './project.js';

const escape = value => JSON.stringify(value);

export function unitTemplate(symbol) {
  const scenarios = symbol.uses_fetch ? [
    'successful API response', 'HTTP 400 bad request', 'HTTP 401/403 authentication or authorization failure',
    'HTTP 404 not found', 'HTTP 500/503 server failure', 'network or unavailable URL',
    'timeout or abort', 'malformed API payload'
  ] : ['expected public behavior', 'invalid input or failure behavior'];
  const cases = scenarios.map(scenario => `  it(${escape(scenario)}, async () => {\n    throw new Error(${escape(`MATMA: implement unit ${symbol.id} — ${scenario}; real target, centralized collaborator mocks, meaningful assertions`)});\n  });`).join('\n\n');
  return `// MATMA-JS GENERATED TEST STARTER; developer-owned after creation.\n` +
    `// Test ONLY publicly accessible ${symbol.kind} ${symbol.name}; one real unit and all other collaborators mocked.\n` +
    `// Production: ${symbol.file}; exported names: ${symbol.exports.join(', ')}\n` +
    `// Configure dependencies through tests/mocks/mirror/. Missing DI seams are diagnostics, not permission to bypass isolation.\n` +
    `import { describe, it } from 'vitest';\n\ndescribe(${escape(`MATMA unit ${symbol.id}`)}, () => {\n${cases}\n});\n`;
}

export function interactionTemplate(symbol) {
  return `// MATMA-JS GENERATED TEST STARTER; developer-owned after creation.\n`+
    `// Select a concrete A -> B collaboration. Instantiate TWO real units, mock every other collaborator.\n`+
    `// ${symbol.id} is the target; do not claim a pair was tested until the second real participant is explicit.\n`+
    `import { describe, it } from 'vitest';\n\ndescribe(${escape(`MATMA interaction ${symbol.id}`)}, () => {\n`+
    `  it('real A -> real B; remaining dependencies mocked', async () => {\n`+
    `    throw new Error(${escape(`MATMA: implement pairwise interaction for ${symbol.id}`)});\n`+
    `  });\n});\n`;
}

export function mockTemplate(symbol) {
  const title = `createMock${symbol.name.replace(/[^a-zA-Z0-9_$]/g, '_')}`;
  return `// MATMA-JS GENERATED CENTRALIZED MOCK HELPER; developer-owned after creation.\n`+
    `// This is a strict collaborator seam, NOT a substitute for authoring meaningful test behavior.\n`+
    `// For class constructors, pass a real constructible function; never fake unmockable closures.\n`+
    `import { vi } from 'vitest';\n\n`+
    `export function ${title}(implementation) {\n`+
    `  if (typeof implementation !== 'function') {\n`+
    `    throw new TypeError(${escape(`MATMA mock ${symbol.id}: provide an explicit behavior function`)});\n`+
    `  }\n`+
    `  return vi.fn(implementation);\n`+
    `}\n`;
}

export function scaffold(root, selected, options = {}) {
  const created = [];
  const present = [];
  const files = {};
  for (const symbol of selected) {
    if (!symbol.public) throw new MatmaError('private_target', `Cannot scaffold non-public symbol ${symbol.id}; test through its public consumers`);
    files[symbol.mirrors.unit_test] = unitTemplate(symbol);
    files[symbol.mirrors.interaction_test] = interactionTemplate(symbol);
    files[symbol.mirrors.mock_file] = mockTemplate(symbol);
  }
  if (selected.some(symbol => symbol.uses_fetch)) files[`${options.testRoot || 'tests'}/mocks/mirror/_external/mock_fetch.mjs`] = fs.readFileSync(new URL('../templates/strict-fetch.mock.mjs', import.meta.url), 'utf8');
  // Preflight every destination before writing anything.
  for (const relative of Object.keys(files)) {
    const full = safeOutput(root, relative);
    if (fs.existsSync(full)) {
      if (!fs.statSync(full).isFile()) throw new MatmaError('unsafe_output', `Not a regular file: ${relative}`);
      present.push(relative);
    }
  }
  for (const [relative, content] of Object.entries(files).sort(([a],[b]) => a.localeCompare(b))) {
    if (present.includes(relative)) continue;
    const absolute = safeOutput(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, { flag: 'wx' });
    created.push(relative);
  }
  return { created, existing: present.sort(), unfinished_tests: created.filter(p => p.includes('.test.mjs')) };
}
