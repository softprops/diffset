## 3.0.0

- Upgrade Node.js version to 24 in action
Make sure your runner is on version v2.327.1 or later to ensure compatibility with this release. [Release Notes](https://github.com/actions/runner/releases/tag/v2.327.1)

## 2.2.0

- Migrate from jest to vitest
- Bump to use node 24
- Dependency updates

## 2.1.6

maintenance release with updated dependencies

## 2.1.5

maintenance release with updated dependencies

## 2.1.4

maintenance release with updated dependencies

## 2.1.3

fix lockfile issue

## 2.1.2

maintenance release with updated dependencies

## 2.1.1

maintenance release with updated dependencies

## 2.1.0

### Exciting New Features 🎉
* feat: get github.token as default input by @chenrui333 in https://github.com/softprops/diffset/pull/14

### Other Changes 🔄
* fix GITHUB_TOKEN ref by @chenrui333 in https://github.com/softprops/diffset/pull/16

## 2.0.1

- typescript v5
- update deps and npm lockfile

## 2.0.0

- upgrade to nodejs 20
- update deps

## 1.0.0

## 0.1.7

- upgrade dependencies

## 0.1.6

- upgrade actions diff to node16 to address deprecation warnings
- upgrade actions/core to address deprecation warnings
- upgrade minimatch

## 0.1.5

- bug fix. upgrade to latest octokit now double escapes git flow style branches

## 0.1.4

- bug fix. exclude the ref argument when comparing two branches

## 0.1.3

- bug fix. strip ref for refs/tags as well as refs/heads

## 0.1.2

- add support for push to master

  This action uses the ref that triggered an event as a basis of comparision with a base, typically your default branch. for pushes to you default branch these values will be the same and yielded no diff! In this version the plugin uses the merge sha to resolve files in a merge commit to yield a diff.

- add support for pull_request event diffs

  GitHub pull_request events use different values for `GITHUB_REF`
  that aren't useful as inputs to api calls to resolve a diff set.
  A separate `GITHUB_HEAD_REF` is now resolved when available in place of `GITHUB_REF` which makes pull_request triggers work as expected

## 0.1.1

- fix issue with branches not properly being url encoded before passing off to github api

## 0.1.0

- Initial release
