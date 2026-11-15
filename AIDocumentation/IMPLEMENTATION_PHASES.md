# MATMA-JS — Implementation phases and acceptance status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Read normative seven rules, Python/PHP/Rust ADRs, record JS-specific amendments and API mock rules | Architectural decisions documented |
| 1 | Node.js package, agent-oriented CLI, normalized errors and format flags | Implemented in development branch; CI verification pending |
| 2 | AST symbol inventory (ESM/CommonJS/classic scripts), public/private identity and source-relative mirrors | Implemented in development branch; verify limitations |
| 3 | Named dependency graph, cycle-safe shortest impact, per-symbol AST fingerprints and managed `.auto.yaml` | Implemented in development branch; verify edge cases |
| 4 | Non-overwriting failing Vitest scaffolds, centralized strict mocks, HTTP success/error scenarios | Implemented in development branch; authored consumer assertions required |
| 5 | Manifest-only `impact`/`changes`/`context`; explicit business/regression registration; stale-index gates | Implemented in development branch; verify schema and safety |
| 6 | Consumer fixtures, cross-platform CI, benchmarks, package adoption instructions | CI and consumer fixtures added; real-service regression and performance benchmarks not yet demonstrated |
| **7** | Separate project-consumption instructions and independently portable Claude, ChatGPT/Codex and Antigravity skills | Skill folders created; activation requires installation in consumer project |

## Acceptance checks before release

1. Run the real package test suite on Linux and Windows with supported Node versions; inspect failures, not just workflow setup.
2. Verify pure JS ESM + CommonJS + classic scripts, correct public/private access and genuine symbol-level rather than file-level impact.
3. Verify `index → scaffold → validate → impact → changes → context` in a separate consumer checkout; generated tests must fail until authored.
4. Prove deterministic network errors and HTTP failures using the centralized fetch mock. `fetch` HTTP 500 must **resolve with `ok=false`**, unlike a network error which rejects.
5. Test no production rewrites, no overwriting developer files, unsafe symlinks, stale index and changes to exported/re-exported symbols.
6. Test cycles and private dependencies; handle unresolved computed ESM/CJS dependencies with explicit diagnostics.
7. Run actual business workflows with mocked infrastructure and regression with real dependencies in an approved external consumer environment before approving release.
8. Install each skill in an independent consumer project and inspect the agent instructions and CLI responses. Never claim activation from writing a folder.
9. Record measurements for any performance claim. Hashes/directories are checked at impact time: an indexed manifest lookup does not imply `O(1)` complete freshness verification.

## Deliberately out of scope for this version

React adapter, JSX, TypeScript/TSX, Jest, AST runtime execution, modifying production code to install DI seams, automatic deployment, npm publishing, and pretending generated placeholders constitute test coverage.
