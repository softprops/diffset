import { parseConfig, intoParams } from "../src/util";
import * as assert from "assert";

describe("util", () => {
  describe("infoParams", () => {
    it("transforms a config into diff params for heads", () => {
      assert.deepStrictEqual(
        intoParams({
          githubToken: "aeiou",
          githubRef: "refs/heads/branch",
          githubRepository: "owner/repo",
          fileFilters: {},
          sha: "b04376c43f66b8beed87abe6e28504781a4e461d",
        }),
        {
          base: "master",
          head: "branch",
          owner: "owner",
          repo: "repo",
          ref: "b04376c43f66b8beed87abe6e28504781a4e461d",
        }
      );
    });
    it("preserves git flow style refs", () => {
      assert.deepStrictEqual(
        intoParams({
          githubToken: "aeiou",
          githubRef: "refs/heads/feature/branch",
          githubRepository: "owner/repo",
          fileFilters: {},
          sha: "b04376c43f66b8beed87abe6e28504781a4e461d",
        }),
        {
          base: "master",
          head: "feature%2Fbranch",
          owner: "owner",
          repo: "repo",
          ref: "b04376c43f66b8beed87abe6e28504781a4e461d",
        }
      );
    });
  });
  describe("parseConfig", () => {
    it("parses configuration from env", () => {
      assert.deepStrictEqual(
        parseConfig({
          GITHUB_REF: "head/refs/test",
          GITHUB_REPOSITORY: "softprops/diffset",
          GITHUB_TOKEN: "aeiou",
          GITHUB_SHA: "b04376c43f66b8beed87abe6e28504781a4e461d",
          INPUT_FOO_FILES: "*.foo",
          INPUT_BAR: "ignored",
        }),
        {
          githubRef: "head/refs/test",
          githubRepository: "softprops/diffset",
          githubToken: "aeiou",
          base: undefined,
          fileFilters: {
            foo_files: "*.foo",
          },
          sha: "b04376c43f66b8beed87abe6e28504781a4e461d",
        }
      );
    });
    it("parses configuration from env including custom base", () => {
      assert.deepStrictEqual(
        parseConfig({
          GITHUB_REF: "head/refs/test",
          GITHUB_REPOSITORY: "softprops/diffset",
          GITHUB_TOKEN: "aeiou",
          GITHUB_SHA: "b04376c43f66b8beed87abe6e28504781a4e461d",
          INPUT_FOO_FILES: "*.foo",
          INPUT_BASE: "develop",
          INPUT_BAR: "ignored",
        }),
        {
          githubRef: "head/refs/test",
          githubRepository: "softprops/diffset",
          githubToken: "aeiou",
          base: "develop",
          fileFilters: {
            foo_files: "*.foo",
          },
          sha: "b04376c43f66b8beed87abe6e28504781a4e461d",
        }
      );
    });
  });
});
