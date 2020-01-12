import { sets } from "../src/diff";
import * as assert from "assert";

describe("diff", () => {
  describe("sets", () => {
    it("returns a map of filtered files based on simple patterns", () => {
      const result = sets({ md_files: "**/*.md" }, [
        "foo/bar.md",
        "baz.md",
        "foo.js"
      ]);
      assert.deepStrictEqual(result, {
        md_files: ["foo/bar.md", "baz.md"]
      });
    });
    it("returns yields no map entries for files that don't match", () => {
      const result = sets({ rust_files: "**/*.rs" }, [
        "foo/bar.md",
        "baz.md",
        "foo.js"
      ]);
      assert.deepStrictEqual(result, {});
    });
    it("returns a map of filtered files based on multi-line patterns", () => {
      const result = sets({ jvm_files: "**/*.java\n**/*.scala" }, [
        "src/main/java/com/foo/Bar.java",
        "src/main/scala/com/foo/Baz.scala"
      ]);
      assert.deepStrictEqual(result, {
        jvm_files: [
          "src/main/java/com/foo/Bar.java",
          "src/main/scala/com/foo/Baz.scala"
        ]
      });
    });
  });
});
