---
name: matma-js-antigravity
description: Work with MATMA JavaScript symbol-level AST indexing, strict Vitest mock registries and focused impact selection in Google Antigravity.
---

# MATMA JavaScript for Antigravity

This skill is for plain JavaScript projects. Read `references/MATMA_Seven_Architectural_Rules.md`, `references/JAVASCRIPT_AMENDMENTS.md`, and `references/commands.md` before code changes. The references are bundled locally so the skill remains portable.

1. Work from the consumer JS project root. Identify the selected **public symbol** (`file#symbol`) and use `matma-indexer index` / `context` to inspect only its source and dependencies. Multiple symbols in a source file retain independent test/mock/manifest artifacts. Private symbols are indexed but not separately scaffolded.
2. Use `scaffold` only for missing files. Generated unit and interaction Vitest tests intentionally fail; write real assertions. Never remove tests, rewrite production code, insert dependency injection seams, or convert non-isolatable dependencies into pretend mocks without owner authorization.
3. Enforce MATMA tiers: unit exactly one real symbol; interaction exactly two real collaborating units; business internal workflow real, external infrastructure mocked; regression complete real dataset/services with no mocks. Every mock belongs in centralized mirrored `tests/mocks/mirror/`.
4. Strict external API mock fixtures must cover applicable HTTP success, 400/401/403/404/5xx errors, unavailable URLs/network rejections, abort/timeouts, and invalid response payloads. No unconfigured `undefined` fallback. Do not confuse HTTP `ok=false` with a rejected network call.
5. Static graph: ESM/CommonJS/classic-script JS, no JSX/TS/React-specific treatment. Dynamic import/require expressions, ambiguous module resolution and direct same-module lexical bindings must produce warnings or injection seam reviews, never fabricated certainty.
6. After any source edit, explicitly reindex. `impact` and `changes` only select tests from existing YAML snapshots; they do not execute Vitest. Run selected `npx vitest run` paths explicitly, and report actual results plus missing tests and unresolved dependencies. Business/regression must be explicitly registered/executed and live regressions require approval.
7. If a rule cannot be honored, report the blocker. Maintain byte-stable generated index provenance and never overwrite developer files.
