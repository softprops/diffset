import { parseConfig } from "../src/util";
import * as assert from "assert";

describe("util", () => {
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
