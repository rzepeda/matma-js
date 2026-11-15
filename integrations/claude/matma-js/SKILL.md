---
name: matma-js
description: Apply MATMA's seven testing/mocking rules to plain JavaScript with symbol-level indexing, strict Vitest mocks, and read-only reverse impact selection.
---

# MATMA JavaScript for Claude Code

Use when developing/refactoring a plain JavaScript application using MATMA or when asked which tests a symbol change affects. **Before editing, read `references/MATMA_Seven_Architectural_Rules.md` and `references/JAVASCRIPT_AMENDMENTS.md`**. These are accepted contracts, not optional style guidelines. Read `references/commands.md` for invocation and recovery.

1. **Discovery and context:** Confirm `matma-indexer` is installed and run at the consumer project root. Run `matma-indexer index -o json` to establish a baseline. Use `context -f 'src/path.js#PublicSymbol' -o json` and read only relevant symbol/source regions, tests and centralized mocks. Do not silently import the whole repository into context.
2. **JS atomicity:** Public named symbols are independently mirrored; multiple public symbols per file are allowed. Private symbols are indexed for impact but do not get standalone unit tests. Respect classic-script global assumption warnings; no JSX/TS/React-specific rules.
3. **Scaffolding:** Run `scaffold -f 'src/path.js#PublicSymbol' -o json` only for missing tests/mocks. Scaffolds intentionally throw and must be replaced with genuine assertions. Never overwrite authored tests or silently insert injection seams into production source.
4. **Isolation:** Unit = one real unit and **every collaborator mocked**; interaction = exactly two real interacting units with all others mocked; business = real internal workflow with **external service boundary mocks**; regression = real datasets/services **without mocks**. Mocks are centralized under `tests/mocks/mirror`, never duplicated inline.
5. **Strict APIs:** For `fetch` use `tests/mocks/mirror/_external/mock_fetch.mjs`, configure every scenario explicitly (successful response, 400/401/403/404/500/503, failed network, timeout/AbortError, malformed JSON). A missing route throws. A resolved HTTP error `Response` has `ok=false`; a network error rejects. If an unmockable same-module lexical reference requires injection, explain it and request owner review; do not claim false isolation.
6. **Impact and testing:** After source edits rerun `index` explicitly. Use `impact -f ... -l 1/2 -o json`, or `changes -l 2 -o json`, to obtain existing/missing tests. **MATMA does not execute Vitest**; run selected test paths through `npx vitest run ...` with explicit terminal access and report actual pass/fail. Business/regression registrations need their own explicit execution and real-service gateway approval.
7. **Safety/limits:** Missing/stale index must fail, never be bypassed by pretending a query ran. Dynamic imports, computed CommonJS exports, browser script load order and bundler aliases require warnings/manual verification. Report authored assertions separately from generated placeholders, and successful CI separately from live regression.

When in doubt, ask for a documented architectural exception rather than weakening the seven rules.
