---
name: matma-js-chatgpt
description: Use MATMA JavaScript's symbol-level dependency index and strict Vitest test boundaries in ChatGPT Work or Codex coding sessions.
---

# MATMA JavaScript for ChatGPT/Codex

Read `references/MATMA_Seven_Architectural_Rules.md`, `references/JAVASCRIPT_AMENDMENTS.md` and `references/commands.md` before working on a MATMA consumer. These local instructions do not themselves grant GitHub/terminal access or activate a skill in the ChatGPT web UI.

1. Respect **public symbol identity**: a `.js`/`.mjs`/`.cjs` source can contain multiple independent public tests; private helpers only influence reverse impact. Never treat shared file placement as dependency. JavaScript classic globals have environment-dependent exposure. No JSX/TypeScript/React adapter.
2. At consumer root: `matma-indexer index -o json`; `context -f 'file#symbol' -o json`; `scaffold -f ...` when missing; after edits `index` again; `impact -f ... -l 2 -o json` or `changes -l 2 -o json`. Do not parse AST during read-only impact or run tests merely by selecting them.
3. Generated Vitest unit/interaction tests **fail intentionally** until real assertions are authored. Do not mark placeholders, skipped tests or unconfigured mocks as coverage. A public target's unit test has exactly **one real** unit; a pairwise interaction exactly **two real** collaborating units. Every other collaborator uses centralized reusable mocked behavior. Business workflows use real internal logic with infrastructure mocks, regression real services with **no mocks**.
4. Every HTTP boundary mocked with `fetch` must have a meaningful success case plus applicable error cases (400/401/403/404/5xx, network error, timeout/abort, invalid data). Centralize in `tests/mocks/mirror/`; unconfigured routes throw instead of returning undefined. HTTP error Responses resolve; network/abort failures reject.
5. A same-module lexical binding or non-injectable closure cannot be proven isolated by mocking its exported name. Surface the MATMA `injection_seam_review` warning and propose an explicit seam without silently rewriting production code.
6. Run selected tests with `npx vitest run <paths>` only where the environment allows it. Report commands, observed exit statuses, missing or unfinished tests, unresolved dynamic dependencies, and separate human-approved live-service regressions. Never claim a stale index or failed scaffold represents success.

Use `references/commands.md` to recover from CLI errors. Treat the original seven rules as normative and the JS-specific Rule 1 change as an owner-approved amendment.
