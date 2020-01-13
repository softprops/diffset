import { parseConfig, intoParams } from "../src/util";
import * as assert from "assert";

describe("util", () => {
  describe("infoParams", () => {
    it("transforms a config into diff params", () => {
      assert.deepStrictEqual(
        intoParams({
          githubToken: "aeiou",
          githubRef: "refs/heads/branch",
          githubRepository: "owner/repo",
          fileFilters: {}
        }),
        {
          base: "master",
          head: "branch",
          owner: "owner",
          repo: "repo"
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
          INPUT_FOO_FILES: "*.foo",
          INPUT_BAR: "ignored"
        }),
        {
          githubRef: "head/refs/test",
          githubRepository: "softprops/diffset",
          githubToken: "aeiou",
          fileFilters: {
            foo_files: "*.foo"
          }
        }
      );
    });
  });
});
