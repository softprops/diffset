## 0.1.2

* add support for push to master
  
  This action uses the ref that triggered an event as a basis of comparision with a base, typically your default branch. for pushes to you default branch these values will be the same and yielded no diff! In this version the plugin uses the merge sha to resolve files in a merge commit to yield a diff.
 
* add support for pull_request event diffs

  GitHub pull_request events use different values for `GITHUB_REF`
  that aren't useful as inputs to api calls to resolve a diff set.
  A separate `GITHUB_HEAD_REF` is now resolved when available in place of `GITHUB_REF` which makes pull_request triggers work as expected

## 0.1.1

* fix issue with branches not properly being url encoded before passing off to github api

## 0.1.0

* Initial release