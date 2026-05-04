# Release checklist

Use this checklist when cutting a new diffset release.

## Prepare the release commit

1. Refresh the default branch.

   ```sh
   git fetch origin --prune --tags
   git switch master
   git pull --ff-only origin master
   ```

2. Choose the next version from the merged changes since the last release.

   - Use a patch version for bug fixes and maintenance-only changes.
   - Use a minor version for additive action behavior, inputs, or outputs.
   - Use a major version for breaking behavior or runtime changes.

3. Update the package version without creating a tag yet.

   ```sh
   npm version <version> --no-git-tag-version
   ```

4. Add a new entry at the top of [CHANGELOG.md](CHANGELOG.md).

5. Run the release validation.

   ```sh
   npm ci
   npm run typecheck
   npm test
   npm run fmtcheck
   npm run build
   npm audit --omit=dev --audit-level=moderate
   npm audit --audit-level=high
   zizmor .
   actionlint -color=false
   git diff --check
   ```

6. Confirm the generated bundle is stable after build.

   ```sh
   tmpfile="$(mktemp)"
   cp dist/index.js "$tmpfile"
   npm run build
   cmp -s dist/index.js "$tmpfile"
   ```

7. Commit the release metadata with a DCO sign-off.

   ```sh
   git add CHANGELOG.md package.json package-lock.json dist/index.js
   git commit -s -m "release <version>"
   ```

## Publish the release

1. Create and push the release tag.

   ```sh
   git tag v<version>
   git push origin HEAD:master refs/tags/v<version>
   ```

2. Move the major version tag to the new release commit when the major line should advance.

   ```sh
   git tag -f v<major> v<version>
   git push --force origin refs/tags/v<major>
   ```

3. Create the GitHub Release and mark it as latest.

   ```sh
   gh release create v<version> \
     --title "v<version>" \
     --notes-file <release-notes.md> \
     --target "$(git rev-parse HEAD)" \
     --latest
   ```

4. Verify the tags, release, and workflow runs.

   ```sh
   git ls-remote --tags origin "refs/tags/v<major>" "refs/tags/v<version>"
   gh release view v<version>
   gh run list --workflow main --limit 5
   ```
