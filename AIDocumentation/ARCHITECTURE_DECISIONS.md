# MATMA JavaScript — ADR-001

**Status:** Decisions accepted for MATMA-JS; implementation/acceptance recorded separately.  
**Target:** pure JavaScript, Node 20+, browser scripts; no React/JSX/TypeScript-specific integration.  
**Normative sources:** [`sources/MATMA_Seven_Architectural_Rules.md`](sources/MATMA_Seven_Architectural_Rules.md) and [`sources/MATMA_Architecture_Implementation_Blueprint_Updated.md`](sources/MATMA_Architecture_Implementation_Blueprint_Updated.md).

## Normative rule interpretation

**Explicit JavaScript amendment to Rule 1:** the atomic test/index/impact identity is a named **publicly accessible JavaScript symbol** (function, class, named binding, or named export). Multiple primary symbols may share a file, as agreed for Rust. A private symbol is indexed to propagate changes, but is not independently scaffolded as a public test target. A class's members belong to the class; nested functions belong to their enclosing unit. File co-location alone is never a proven dependency. The JavaScript module can be included in metadata for module-level behavior, but a module is **not** a substitute for inventing an independently public symbol.

**Rules 2–7 remain strict:** unit = exactly one real public unit; pairwise interaction = exactly two real collaborating units and all other downstream collaborators mocked; business = real internal workflow with infrastructure boundary mocks; regression = real participating datasets/services, no mocks; centralized mirrored mock registry and mirrored vs. process-oriented directory tiers remain mandatory. A function-shaped unit does not have to be reimplemented as a class merely to satisfy the original wording.

## Accepted language decisions

| ID | Accepted decision | Enforcement and honest limits |
| --- | --- | --- |
| JS-01 | Public symbols, not physical modules, are units. | Symbol IDs use `source/path.js#symbol`; private symbols are indexed for impact. |
| JS-02 | Multiple symbols per `.js`/`.mjs`/`.cjs` file. | Per-symbol test/mock/YAML mirrors nested under the original source filename. No impact merely from sharing a file. |
| JS-03 | Test only publicly accessible declarations. | ESM exports, CommonJS exports and traditional script globals. Private helpers have no standalone generated tests; they influence public consumers. Public access of classic-script global bindings depends on script inclusion and execution environment; report the assumption. |
| JS-04 | Static dependencies are authoritative for impact. | Resolve known ESM/CJS references; report unresolved relative imports, dynamic expressions, computed exports and other incomplete coverage. Never fabricate edges. Import-only may conservatively enter impact at level 2. |
| JS-05 | Vitest only for test generation. | MATMA never invokes Vitest directly. The consumer runs `vitest run <selected test paths>` and owns its environment/config. |
| JS-06 | Strict centralized mocks. | A behavior must be explicitly configured. Calls missing a scenario throw; no implicit `undefined`. When undefined is legitimate, it must be an *explicitly configured return value*. |
| JS-07 | Non-isolatable references require explicit diagnostics and injection seam review. | Do not silently claim a unit mock replaced a same-module lexical reference or an inaccessible closure. No production refactor automatically inserted. |
| JS-08 | Never rewrite production code to accommodate mocking. | Scaffolds only create missing tests/mock helpers. Preserve developer-authored tests; index only manages clearly marked generated `.auto.yaml`. |
| JS-09 | No framework-specific special cases. | React is just an imported JavaScript dependency. No React components/hooks, JSX, TS or TSX analyzers. |
| JS-10 | Support `.js` ESM/CommonJS, `.mjs`, `.cjs`, and classic `<script>`-loaded JS. | No `.jsx`, `.ts`, `.tsx`. Runtime browser loading order and nonliteral module expressions remain diagnostics. |
| JS-11 | External HTTP API mocks cover failure scenarios, not just success. | Central strict fetch mock supports response, HTTP 400/401/403/404/5xx, rejected network request, abort/timeout and malformed JSON. Scaffolds generate failing cases for each scenario; actual assertions are authored. |

## Inherited engineering contracts from MATMA Python, PHP and Rust

- Tool adapts to the **existing** project tree. There is no production-source rewriting or renaming.
- AST analysis is build/index-time, never application-code execution. Use compiler API to resolve declarations and aliases; distinguish real use (L1) from import-only/side-effect relationships (L2).
- `index` persists source symbol manifests and reverse dependency relationships as generated YAML. `impact`, `changes` and `context` use the saved index, fail if stale and do not rebuild AST or execute tests.
- Levels are **inclusive**; shortest weighted reverse paths are cycle-safe. A modified private symbol's changed fingerprint can pull in a public dependent. Changes compare previous/current graph union to retain removals.
- Source fingerprints are per symbol rather than only per physical file. The latter is still tracked for freshness. Normalization uses TypeScript printer output and removes comments; macros/generated transformations and runtime closures require separate evidence.
- Scaffolds are non-overwriting and intentionally red until developer-authored real assertions. Business and regression tests follow an explicit, human-owned `tests/matma-verification.yaml` registry; they are not guessed from file names.
- Zero false certainty: a generated test is not coverage; a selected test did not run; an index graph is not a guarantee of runtime dependency completeness. Missing DI seams and API boundary limits must be inspected before claiming rule 2/4 compliance.
- Generated index files are not committed; user-owned tests, mock files and verification registry are committed. JSON is preferred for AI agents; YAML for persisted manifests; failures have stable machine-readable error codes.

## Mirroring example

```text
src/domain/user.js                                 # public createUser, public loadUser, private normalize
 tests/unit/mirror/src/domain/user.js/test_create_user.test.mjs
 tests/interaction/mirror/src/domain/user.js/test_create_user_interaction.test.mjs
 tests/mocks/mirror/src/domain/user.js/mock_create_user.mjs
 tests/mirror/src/domain/user.js/create_user.auto.yaml
 tests/mirror/src/domain/user.js/normalize.auto.yaml  # metadata only; no private tests
 tests/business/checkout.test.mjs                # not mirrored, human owned
 tests/regression/e2e.test.mjs                   # not mirrored, live gateways
```

## Explicit first-release analysis limits

The static analyzer is not a full runtime, bundler or browser emulator. Computed `module.exports` keys, nonliteral require/import, namespace mutation, indirect global exposure, complex aliases, module initialization order, and dynamic DI cannot be proven from ASTs alone. The first release reports warnings and never claims total coverage. Import-only L2 can deliberately include conservative false-positive dependents. `fetch` is the first shared HTTP mock; custom API libraries (Axios, XMLHttpRequest, WebSocket, etc.) need authored centralized adapters and explicit error cases; a generated generic helper alone is not sufficient proof of isolation. The parser supports ordinary JavaScript syntax only, not JSX/TypeScript transforms. For ESM `import` resolution, only analyzable local refs are indexed as internal graph edges; package/bundler aliases may require later resolver adapters.

## Packaging and release policy

Install as an npm **development** dependency (directly from approved Git ref during development). No automatic publication to npm, no release tag, no main-branch merge without separate acceptance. Node/Vitest and consumer compatibility must be verified via CI; successful static analysis does not constitute end-to-end regression testing.
