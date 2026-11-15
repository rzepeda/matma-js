# MATMA JavaScript real consumer fixture

ESM `validator.mjs` has two public symbols. `user.mjs` imports a real collaborator and uses `fetch`. `legacy.cjs` exports CommonJS functions, and `globals.js` represents classic scripts.

From this fixture root with MATMA installed:

```bash
matma-indexer index -o json
matma-indexer impact -f 'src/validator.mjs#validateEmail' -l 1 -o json
matma-indexer scaffold -f 'src/user.mjs#loadUser' -o json
```

The business fixture under `tests/consumer_workflow.test.js` has real assertions for success, HTTP errors, network errors, aborts/timeouts, invalid JSON, and unconfigured requests. `scaffold` generates **additional intentionally failing** unit and interaction starter tests. They are not executed as part of the package's own Vitest suite until assertions are authored.
