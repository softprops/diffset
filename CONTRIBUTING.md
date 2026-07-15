# Contributing

This is a Node 24 GitHub Action written in TypeScript. Use the Node version in
`.tool-versions` and install the locked dependency graph from the repository
root:

```sh
npm ci
```

## Validation

Run the same source, test, formatting, and bundle checks used by CI:

```sh
npm run typecheck
npm test
npm run fmtcheck
npm run build
git diff --check
```

Tests live in `__tests__/`. Production source lives in `src/`, and
`npm run build` regenerates the checked-in `dist/index.js` action bundle. Include
the regenerated bundle in the same commit as any production-source change.

## Formatting

Run `npm run fmt` only when intentionally formatting touched TypeScript files.
Avoid unrelated formatting churn.
