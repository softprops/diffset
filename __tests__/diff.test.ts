import { sets, GitHubDiff } from "../src/diff";
import * as assert from "assert";

import { describe, it } from "vitest";

describe("diff", () => {
  describe("GitHubDiff", () => {
    it("generates diff based on compare api", async () => {
      // nock("https://api.github.com")
      //   .persist()
      //   .get("/repos/owner/repo/compare/master...foo")
      //   .reply(
      //     200,
      //     JSON.stringify({
      //       files: [
      //         {
      //           status: "added",
      //           filename: "added.txt"
      //         },
      //         {
      //           status: "removed",
      //           filename: "removed.txt"
      //         }
      //       ]
      //     })
      //   );
      // const response = await new GitHubDiff(new GitHub("fake")).diff({
      //   head: "foo",
      //   base: "master",
      //   owner: "owner",
      //   repo: "repo"
      // });
    });
  });
  describe("sets", () => {
    it("returns a map of filtered files based on simple patterns", () => {
      const result = sets({ md_files: "**/*.md" }, [
        "foo/bar.md",
        "baz.md",
        "foo.js",
      ]);
      assert.deepStrictEqual(result, {
        md_files: ["foo/bar.md", "baz.md"],
      });
    });
    it("returns yields no map entries for files that don't match", () => {
      const result = sets({ rust_files: "**/*.rs" }, [
        "foo/bar.md",
        "baz.md",
        "foo.js",
      ]);
      assert.deepStrictEqual(result, {});
    });
    it("returns a map of filtered files based on multi-line patterns", () => {
      const result = sets({ jvm_files: "**/*.java\n**/*.scala" }, [
        "src/main/java/com/foo/Bar.java",
        "src/main/scala/com/foo/Baz.scala",
      ]);
      assert.deepStrictEqual(result, {
        jvm_files: [
          "src/main/java/com/foo/Bar.java",
          "src/main/scala/com/foo/Baz.scala",
        ],
      });
    });
  });
});
