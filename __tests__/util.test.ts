import { parseConfig, sets } from "../src/util";
import * as assert from "assert";

describe("util", () => {
  describe("sets", () => {
    it("returns a map of filtered test", () => {
      const result = sets({ md_files: "**/*.md", rust_files: "**/*.rs" }, [
        "foo/bar.md",
        "foo.js"
      ]);
      assert.deepStrictEqual(result, {
        md_files: ["foo/bar.md"]
      });
    });
  });
  describe("parseConfig", () => {
    it("parses basic config", () => {
      assert.deepStrictEqual(parseConfig({}), {
        github_ref: "",
        github_repository: "",
        github_token: ""
      });
    });
  });
});
