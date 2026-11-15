# MATMA JS consumer CLI — agent reference

Install `@rzepeda/matma-js` from a pinned Git revision and Vitest as dev dependencies. Run from consumer root. `matma-indexer --help` is the authoritative option list.

```sh
matma-indexer index -o json
matma-indexer scaffold -f 'src/module.js#PublicSymbol' -o json
matma-indexer validate --check -o json
matma-indexer impact -f 'src/module.js#PublicSymbol' -l 2 -o json
npx vitest run tests/unit/mirror/src/module.js/test_public_symbol.test.mjs
matma-indexer index -o json # after edits
matma-indexer changes -l 2 -o json
matma-indexer context -f 'src/module.js#PublicSymbol' -o json
```

`index` is a full static build. `impact`, `changes`, `context` read persisted manifests, verify freshness, and do not run tests. `--level 0` target unit, `1` direct real-use and interaction, `2+` conservative import-only/side-effect and transitive dependents, inclusive and cycle-safe. Never conflate returned missing tests with runnable paths.

Typical errors: `missing_index` / `stale_index` => explicitly `index`; `ambiguous_target` => exact `file#symbol`; `private_target` => test via public consumers; `foreign_manifest` / `unsafe_symlink` => stop and inspect ownership; `validation_failed` => author missing or failing placeholder tests; dynamic/unresolved dependencies => manual review and independently registered business/regression evidence.

`tests/matma-verification.yaml` is user-owned and registers business/regression suites by fully qualified public symbol ID. Those suites and live-service regression gateways are executed by the project's own CI policy, not automatically by MATMA.

HTTP strict double at `tests/mocks/mirror/_external/mock_fetch.mjs`: `createStrictFetchMock().when('GET','/path',{type:'http_error',status:503,body:{error:'down'}})`; supports `json`, `network_error`, `timeout`, `invalid_json` and explicitly configured HTTP errors. Any missing route **throws**, never silently returns undefined. Reset global fetch state after each test.
