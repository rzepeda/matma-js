# MATMA JavaScript

**MATMA (Multi-Tiered Agentic Testing & Mock Architecture)** for **plain JavaScript**. A development-time indexer and scaffolder to help coding agents use precise test/mock boundaries and select affected tests without loading an entire repository.

**Development status:** not published to npm; verify CI and a real consumer before a release. See the [seven governing rules](AIDocumentation/sources/MATMA_Seven_Architectural_Rules.md), [JavaScript architecture decisions](AIDocumentation/ARCHITECTURE_DECISIONS.md), and [implementation phases](AIDocumentation/IMPLEMENTATION_PHASES.md).

## Architectural guarantees and boundaries

- **One public symbol = one MATMA test identity.** Multiple named exports/classes/functions in one `.js`, `.mjs` or `.cjs` are independently mirrored, tested, indexed and change-tracked. Private symbols are indexed for dependency impact but not independently unit-tested. No false dependency merely from being in the same file.
- **One real unit / two real interaction partners**; other collaborators are centralized mocks. Business tests run real internal workflow logic with mocked service boundaries; regression runs real services/datasets with **no mocks**.
- **Static-first AST indexing:** ESM and CommonJS imports, aliases, reexports and ordinary classic scripts; third-party packages are recorded as external collaborators without framework-specific treatment. Explicitly warn for nonliteral imports or other unresolved cases. Native JavaScript only; no React-specific handling, JSX, TypeScript/TSX or Jest.
- **Strict mocks:** no silent `undefined` fallback. `fetch` double supports HTTP success/error, network error, timeout/abort and malformed JSON. Generated Vitest tests *fail* until you author actual assertions.
- **Non-destructive:** no rewrites or injection seams inserted into production. Existing tests and mocks are never overwritten. Generated `.auto.yaml` files are owned by MATMA and safe to regenerate; `impact` never reparses AST and never runs Vitest.

## Installation from this checkout (development)

Requires Node.js >=20 and npm. Use in the **consumer project** as a development-only tool:

```sh
# From MATMA checkout:
npm install
npm test
npm link
# From a consumer project:
npm link @rzepeda/matma-js
matma-indexer --help
```

For a Git-based consumer install, pin an approved revision rather than assuming an npm registry release:

```sh
npm install --save-dev github:rzepeda/matma-js#<approved-commit>
npm install --save-dev vitest
```

MATMA does not install Vitest automatically in consumer apps, and does not modify their `package.json` test command. Run the CLI from the **consumer root**.

## Standard workflow

```sh
matma-indexer index -o json
matma-indexer scaffold --target 'src/user.js#createUser' -o json
# Now author real tests, strict mocks and DI seams where required.
matma-indexer validate --check -o json
matma-indexer impact -f 'src/user.js#createUser' -l 2 -o json
# Run the returned test paths explicitly with Vitest:
npx vitest run tests/unit/mirror/src/user.js/test_create_user.test.mjs
# After source edits, explicitly rebuild:
matma-indexer index -o json
matma-indexer changes -l 2 -o json
matma-indexer context -f 'src/user.js#createUser' -o json
```

`validate --check` intentionally fails when mirrored files are missing or starter tests still contain `MATMA: implement`. That means work remains, not an indexer defect. `scaffold` without `--target` creates missing companions for all public symbols (potentially many tests). Private symbols are not scaffold targets. Files with multiple symbols need a `file#symbol` target for unambiguous selection.

## CLI

| Command | Operation |
| --- | --- |
| `index` | Static AST discovery, reverse graph build, deterministic generated YAML manifests and source freshness metadata |
| `scaffold` | Create missing **failing** unit and interaction Vitest tests and shared strict mock files; never overwrite |
| `validate [--check]` | Inspect missing and unfinished test/mock mirrors; `--check` exits nonzero on incomplete files |
| `impact --target ... --level N` | Query persisted graph, select **existing** unit/interaction tests, list **missing** tests and registered business/regression paths |
| `changes --level N` | Compare indexed previous/current symbol fingerprints and old/new dependency edges |
| `context --target ...` | Return bounded source region and its dependencies; avoid reading unrelated symbols |

Flags: `-s/--source-root` (repeat), `-t/--tests-root`, `-f/--target`, `-l/--level`, `-o/--format text|json|yaml`, `-S/--scaffold`, `-c/--check`. Use `matma.config.json` with `{"sourceRoots":["src","scripts"]}` to index multiple roots without changing the application layout. Defaults to `src/` if present or the project root otherwise; `.js`, `.mjs`, `.cjs` only. `--level 0` selects target public unit; `1` adds direct proven-use dependents and interaction tests; `2+` adds import-only/conservative dependencies and transitive hops via shortest weighted reverse paths. Levels are inclusive.

Example mirrors:

```text
src/api/user.js
  tests/unit/mirror/src/api/user.js/test_create_user.test.mjs
  tests/interaction/mirror/src/api/user.js/test_create_user_interaction.test.mjs
  tests/mocks/mirror/src/api/user.js/mock_create_user.mjs
  tests/mirror/src/api/user.js/create_user.auto.yaml
```

Generated `.auto.yaml` are ignored; **track** developer-authored test/mock files and the verification registry in Git. Manifests are regenerated; do not edit them. `impact` validates source hashes and tracked directory names, so it is not constant-time end-to-end even though it does not parse AST.

## External API isolation and negative tests

When `fetch` is used, scaffolding creates `tests/mocks/mirror/_external/mock_fetch.mjs`. Example (author into the actual test):

```javascript
import { vi, afterEach, expect, it } from 'vitest';
import { createStrictFetchMock } from '../../mocks/mirror/_external/mock_fetch.mjs';
afterEach(() => vi.unstubAllGlobals());

it('handles an HTTP 503 (fetch resolves; ok is false)', async () => {
  const http = createStrictFetchMock();
  http.when('GET', '/api/users/1', { type: 'http_error', status: 503, body: { error: 'down' } });
  vi.stubGlobal('fetch', http.fetch);
  const response = await fetch('/api/users/1');
  expect(response.ok).toBe(false);
});
```

Other scenarios: `json` for success, `network_error` (rejected promise), `timeout` (AbortError), and `invalid_json` (failed `response.json()`). Unconfigured routes always throw. These are **tools for authoring** actual assertions; merely generating the helper does not prove error paths in the application. An unmockable same-module lexical closure must be reported, not falsely replaced. Preserve explicit DI/factory interfaces if the application already offers them; propose changes for owner review otherwise.

## Business and regression registration

Track **`tests/matma-verification.yaml`** (human owned), for example:

```yaml
schema_version: 1
registrations:
  "src/api/user.js#createUser":
    business:
      - tests/business/user_registration.test.mjs
    regression:
      - tests/regression/user_journey.test.mjs
```

Registered files are *reported* by `impact` and selected explicitly by the consumer's CI. They are not mapped mechanically to a symbol path and are never run by MATMA. Regression against real services is a separate pre-merge/deployment gateway, not a mocked Vitest unit test.

## Agent skills

The final phase includes separate, independently portable bundles at [`integrations/claude/matma-js/`](integrations/claude/matma-js/), [`integrations/chatgpt/matma-js-chatgpt/`](integrations/chatgpt/matma-js-chatgpt/) and [`integrations/antigravity/matma-js-antigravity/`](integrations/antigravity/matma-js-antigravity/). Read [`integrations/README.md`](integrations/README.md) before installing. Copying skills does not install MATMA, enable tools, run tests or authorize deployment.

## Current limitations

Static analysis cannot prove computed CJS exports, dynamic import expressions, runtime-global script order, bundler-specific aliases, transpilers or same-module interception. Literal dynamic imports may be conservatively connected; unresolved dependencies are warnings, not invented edges. Imported package frameworks are not specially analyzed. Supported JavaScript script public/global visibility is an assumption until verified in the target browser context. An explicitly incomplete/inaccessible mock seam must be addressed in application design before the test is represented as isolated.

CI is configured for Node 20/22 on Linux/Windows, with Vitest package tests, consumer fixtures, CLI checks and npm packing. Successful CI is not a substitute for a live-service regression gateway or measured speed benchmark.
