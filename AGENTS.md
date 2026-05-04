# Repository Instructions

## Project Shape

This is a Node 24 GitHub Action written in TypeScript. Source lives in
`src/`, tests live in `__tests__/`, and the action entrypoint is the checked-in
`dist/index.js` bundle.

The bundle is generated with esbuild as CommonJS for the GitHub Actions runtime.
Do not reintroduce `@vercel/ncc` unless there is a concrete reason and the
`@actions/core` exports-map behavior has been rechecked.

## Development Workflow

Use npm from the repository root.

```sh
npm ci
npm run typecheck
npm test
npm run fmtcheck
npm run build
```

When changing `src/`, rebuild `dist/index.js` and include the generated bundle
in the same commit. Keep runtime behavior changes covered by tests under
`__tests__/`.

Run `npm run fmt` only when intentionally formatting touched TypeScript files.
Avoid unrelated formatting churn.

## Release Workflow

Use [RELEASE.md](RELEASE.md) as the release checklist. Keep release metadata in
`CHANGELOG.md`, `package.json`, `package-lock.json`, and `dist/index.js`
aligned when cutting a release.

## Git Hygiene

Create commits with a DCO sign-off using `git commit -s`.

Do not use `codex` in branch names, commit messages, or pull request titles.
Use task-specific names such as `docs-update-maintainer-guide` or
`fix-large-compare-diffs`.

For direct pushes to `master` that intentionally resolve a tracked issue,
include the appropriate closing keyword in the commit message.
